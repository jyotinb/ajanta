//frappe.provide("erpnext.selling");
frappe.require("assets/erpnext/js/controllers/stock_controller.js");
msgprint("hook3");
erpnext.taxes_and_totals = erpnext.stock.StockController.extend({
	calculate_taxes_and_totals: function(update_paid_amount) {
		msgprint("hi11");
		this.discount_amount_applied = false;
		this._calculate_taxes_and_totals();

		if (frappe.meta.get_docfield(this.frm.doc.doctype, "discount_amount"))
			this.apply_discount_amount();

		// Advance calculation applicable to Sales /Purchase Invoice
		if(in_list(["Sales Invoice", "Purchase Invoice"], this.frm.doc.doctype)
			 && this.frm.doc.docstatus < 2 && !this.frm.doc.is_return) {
				 this.calculate_total_advance(update_paid_amount);
		}

		// Sales person's commission
		if(in_list(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"], this.frm.doc.doctype)) {
			this.calculate_commission();
			this.calculate_contribution();
		}

		this.frm.refresh_fields();
	},

	_calculate_taxes_and_totals: function() {
		msgprint("hi11");
		this.validate_conversion_rate();
		this.calculate_item_values();
		this.initialize_taxes();
		this.determine_exclusive_rate();
		this.calculate_net_total();
		this.calculate_taxes();
		this.manipulate_grand_total_for_inclusive_tax();
		this.calculate_totals();
		this._cleanup();
		this.show_item_wise_taxes();
	},

	validate_conversion_rate: function() {
		this.frm.doc.conversion_rate = flt(this.frm.doc.conversion_rate, precision("conversion_rate"));
		var conversion_rate_label = frappe.meta.get_label(this.frm.doc.doctype, "conversion_rate",
			this.frm.doc.name);
		var company_currency = this.get_company_currency();

		if(!this.frm.doc.conversion_rate) {
			if(this.frm.doc.currency == company_currency) {
				this.frm.set_value("conversion_rate", 1);
			} else {
				frappe.throw(repl('%(conversion_rate_label)s' +
					__(' is mandatory. Maybe Currency Exchange record is not created for ') +
					'%(from_currency)s' + __(" to ") + '%(to_currency)s',
					{
						"conversion_rate_label": conversion_rate_label,
						"from_currency": this.frm.doc.currency,
						"to_currency": company_currency
					}));
			}
			
		}
	},

	calculate_item_values: function() {
		var me = this;
        msgprint("hi2");
		if (!this.discount_amount_applied) {
			$.each(this.frm.doc["items"] || [], function(i, item) {
				frappe.model.round_floats_in(item);
				item.net_rate = item.rate;
				
				item.amount = flt(item.rate * item.qty, precision("amount", item));
				item.net_amount = item.amount;
				item.item_tax_amount = 0.0;

				me.set_in_company_currency(item, ["price_list_rate", "rate", "amount", "net_rate", "net_amount"]);
			});
		}
	},  

	set_in_company_currency: function(doc, fields) {
		var me = this;
		$.each(fields, function(i, f) {
			doc["base_"+f] = flt(flt(doc[f], precision(f, doc)) * me.frm.doc.conversion_rate, precision("base_" + f, doc));
		})
	},

	initialize_taxes: function() {
		var me = this;

		$.each(this.frm.doc["taxes"] || [], function(i, tax) {
			tax.item_wise_tax_detail = {};
			tax_fields = ["total", "tax_amount_after_discount_amount",
				"tax_amount_for_current_item", "grand_total_for_current_item",
				"tax_fraction_for_current_item", "grand_total_fraction_for_current_item"]

			if (cstr(tax.charge_type) != "Actual" &&
				!(me.discount_amount_applied && me.frm.doc.apply_discount_on=="Grand Total"))
					tax_fields.push("tax_amount");

			$.each(tax_fields, function(i, fieldname) { tax[fieldname] = 0.0 });

			if (!this.discount_amount_applied) {
				cur_frm.cscript.validate_taxes_and_charges(tax.doctype, tax.name);
				me.validate_inclusive_tax(tax);
			}
			frappe.model.round_floats_in(tax);
		});
	},

	determine_exclusive_rate: function() {
		var me = this;

		var has_inclusive_tax = false;
		$.each(me.frm.doc["taxes"] || [], function(i, row) {
			if(cint(row.included_in_print_rate)) has_inclusive_tax = true;
		})
		if(has_inclusive_tax==false) return;

		$.each(me.frm.doc["items"] || [], function(n, item) {
			var item_tax_map = me._load_item_tax_rate(item.item_tax_rate);
			var cumulated_tax_fraction = 0.0;

			$.each(me.frm.doc["taxes"] || [], function(i, tax) {
				tax.tax_fraction_for_current_item = me.get_current_tax_fraction(tax, item_tax_map);

				if(i==0) {
					tax.grand_total_fraction_for_current_item = 1 + tax.tax_fraction_for_current_item;
				} else {
					tax.grand_total_fraction_for_current_item =
						me.frm.doc["taxes"][i-1].grand_total_fraction_for_current_item +
						tax.tax_fraction_for_current_item;
				}

				cumulated_tax_fraction += tax.tax_fraction_for_current_item;
			});

			if(cumulated_tax_fraction && !me.discount_amount_applied) {
				item.net_amount = flt(item.amount / (1 + cumulated_tax_fraction), precision("net_amount", item));
				item.net_rate = flt(item.net_amount / item.qty, precision("net_rate", item));

				me.set_in_company_currency(item, ["net_rate", "net_amount"]);
			}
		});
	},

	get_current_tax_fraction: function(tax, item_tax_map) {
		// Get tax fraction for calculating tax exclusive amount
		// from tax inclusive amount
		var current_tax_fraction = 0.0;

		if(cint(tax.included_in_print_rate)) {
			var tax_rate = this._get_tax_rate(tax, item_tax_map);

			if(tax.charge_type == "On Net Total") {
				current_tax_fraction = (tax_rate / 100.0);

			} else if(tax.charge_type == "On Previous Row Amount") {
				current_tax_fraction = (tax_rate / 100.0) *
					this.frm.doc["taxes"][cint(tax.row_id) - 1].tax_fraction_for_current_item;

			} else if(tax.charge_type == "On Previous Row Total") {
				current_tax_fraction = (tax_rate / 100.0) *
					this.frm.doc["taxes"][cint(tax.row_id) - 1].grand_total_fraction_for_current_item;
			}
		}

		if(tax.add_deduct_tax) {
			current_tax_fraction *= (tax.add_deduct_tax == "Deduct") ? -1.0 : 1.0;
		}
		return current_tax_fraction;
	},

	_get_tax_rate: function(tax, item_tax_map) {
		return (keys(item_tax_map).indexOf(tax.account_head) != -1) ?
			flt(item_tax_map[tax.account_head], precision("rate", tax)) : tax.rate;
	},

	calculate_net_total: function() {
		var me = this;
		this.frm.doc.total = this.frm.doc.base_total = this.frm.doc.net_total = this.frm.doc.base_net_total = 0.0;

		$.each(this.frm.doc["items"] || [], function(i, item) {
			me.frm.doc.total += item.amount;
			me.frm.doc.base_total += item.base_amount;
			me.frm.doc.net_total += item.net_amount;
			me.frm.doc.base_net_total += item.base_net_amount;
		});

		frappe.model.round_floats_in(this.frm.doc, ["total", "base_total", "net_total", "base_net_total"]);
	},

	calculate_taxes: function() {
		var me = this;
		var actual_tax_dict = {};

		// maintain actual tax rate based on idx
		$.each(this.frm.doc["taxes"] || [], function(i, tax) {
			if (tax.charge_type == "Actual") {
				actual_tax_dict[tax.idx] = flt(tax.tax_amount, precision("tax_amount", tax));
			}
		});

		$.each(this.frm.doc["items"] || [], function(n, item) {
			var item_tax_map = me._load_item_tax_rate(item.item_tax_rate);

			$.each(me.frm.doc["taxes"] || [], function(i, tax) {
				// tax_amount represents the amount of tax for the current step
				var current_tax_amount = me.get_current_tax_amount(item, tax, item_tax_map);

				// Adjust divisional loss to the last item
				if (tax.charge_type == "Actual") {
					actual_tax_dict[tax.idx] -= current_tax_amount;
					if (n == me.frm.doc["items"].length - 1) {
						current_tax_amount += actual_tax_dict[tax.idx]
					}
				}

				// accumulate tax amount into tax.tax_amount
				if (tax.charge_type != "Actual" &&
					!(me.discount_amount_applied && me.frm.doc.apply_discount_on=="Grand Total"))
						tax.tax_amount += current_tax_amount;

				// store tax_amount for current item as it will be used for
				// charge type = 'On Previous Row Amount'
				tax.tax_amount_for_current_item = current_tax_amount;

				// tax amount after discount amount
				tax.tax_amount_after_discount_amount += current_tax_amount;

				// for buying
				if(tax.category) {
					// if just for valuation, do not add the tax amount in total
					// hence, setting it as 0 for further steps
					current_tax_amount = (tax.category == "Valuation") ? 0.0 : current_tax_amount;

					current_tax_amount *= (tax.add_deduct_tax == "Deduct") ? -1.0 : 1.0;
				}

				// Calculate tax.total viz. grand total till that step
				// note: grand_total_for_current_item contains the contribution of
				// item's amount, previously applied tax and the current tax on that item
				if(i==0) {
					tax.grand_total_for_current_item = flt(item.net_amount + current_tax_amount, precision("total", tax));
				} else {
					tax.grand_total_for_current_item =
						flt(me.frm.doc["taxes"][i-1].grand_total_for_current_item + current_tax_amount, precision("total", tax));
				}

				// in tax.total, accumulate grand total for each item
				tax.total += tax.grand_total_for_current_item;

				// set precision in the last item iteration
				if (n == me.frm.doc["items"].length - 1) {
					me.round_off_totals(tax);

					// adjust Discount Amount loss in last tax iteration
					if ((i == me.frm.doc["taxes"].length - 1) && me.discount_amount_applied 
							&& me.frm.doc.apply_discount_on == "Grand Total" && me.frm.doc.discount_amount)
						me.adjust_discount_amount_loss(tax);
				}
			});
		});
	},

	_load_item_tax_rate: function(item_tax_rate) {
		return item_tax_rate ? JSON.parse(item_tax_rate) : {};
	},

	get_current_tax_amount: function(item, tax, item_tax_map) {
		var tax_rate = this._get_tax_rate(tax, item_tax_map);
		var current_tax_amount = 0.0;

		if(tax.charge_type == "Actual") {
			// distribute the tax amount proportionally to each item row
			var actual = flt(tax.tax_amount, precision("tax_amount", tax));
			current_tax_amount = this.frm.doc.net_total ?
				((item.net_amount / this.frm.doc.net_total) * actual) : 0.0;

		} else if(tax.charge_type == "On Net Total") {
			current_tax_amount = (tax_rate / 100.0) * item.net_amount;

		} else if(tax.charge_type == "On Previous Row Amount") {
			current_tax_amount = (tax_rate / 100.0) *
				this.frm.doc["taxes"][cint(tax.row_id) - 1].tax_amount_for_current_item;

		} else if(tax.charge_type == "On Previous Row Total") {
			current_tax_amount = (tax_rate / 100.0) *
				this.frm.doc["taxes"][cint(tax.row_id) - 1].grand_total_for_current_item;
		}

		current_tax_amount = flt(current_tax_amount, precision("tax_amount", tax));

		this.set_item_wise_tax(item, tax, tax_rate, current_tax_amount);

		return current_tax_amount;
	},

	set_item_wise_tax: function(item, tax, tax_rate, current_tax_amount) {
		// store tax breakup for each item
		var key = item.item_code || item.item_name;
		var item_wise_tax_amount = current_tax_amount * this.frm.doc.conversion_rate;
		if (tax.item_wise_tax_detail && tax.item_wise_tax_detail[key])
			item_wise_tax_amount += tax.item_wise_tax_detail[key][1]

		tax.item_wise_tax_detail[key] = [tax_rate,flt(item_wise_tax_amount, precision("base_tax_amount", tax))]

	},

	round_off_totals: function(tax) {
		tax.total = flt(tax.total, precision("total", tax));
		tax.tax_amount = flt(tax.tax_amount, precision("tax_amount", tax));
		tax.tax_amount_after_discount_amount = flt(tax.tax_amount_after_discount_amount, precision("tax_amount", tax));

		this.set_in_company_currency(tax, ["total", "tax_amount", "tax_amount_after_discount_amount"]);
	},

	adjust_discount_amount_loss: function(tax) {
		var discount_amount_loss = this.frm.doc.grand_total - flt(this.frm.doc.discount_amount) - tax.total;
		tax.tax_amount_after_discount_amount = flt(tax.tax_amount_after_discount_amount +
			discount_amount_loss, precision("tax_amount", tax));
		tax.total = flt(tax.total + discount_amount_loss, precision("total", tax));
		
		this.set_in_company_currency(tax, ["total", "tax_amount_after_discount_amount"]);
	},
	
	manipulate_grand_total_for_inclusive_tax: function() {
		var me = this;
		// if fully inclusive taxes and diff
		if (this.frm.doc["taxes"] && this.frm.doc["taxes"].length) {
			var all_inclusive = frappe.utils.all(this.frm.doc["taxes"].map(function(d) {
				return cint(d.included_in_print_rate);
			}));

			if (all_inclusive) {
				var last_tax = me.frm.doc["taxes"].slice(-1)[0];

				var diff = me.frm.doc.total - flt(last_tax.total, precision("grand_total"));

				if ( diff && Math.abs(diff) <= (2.0 / Math.pow(10, precision("tax_amount", last_tax))) ) {
					last_tax.tax_amount += diff;
					last_tax.tax_amount_after_discount += diff;
					last_tax.total += diff;
					
					this.set_in_company_currency(last_tax, 
						["total", "tax_amount", "tax_amount_after_discount_amount"]);
				}
			}
		}
	},

	calculate_totals: function() {
		// Changing sequence can cause roundiing issue and on-screen discrepency
		var me = this;
		var tax_count = this.frm.doc["taxes"] ? this.frm.doc["taxes"].length : 0;
		this.frm.doc.grand_total = flt(tax_count ? this.frm.doc["taxes"][tax_count - 1].total : this.frm.doc.net_total);

		if(in_list(["Quotation", "Sales Order", "Delivery Note", "Sales Invoice"], this.frm.doc.doctype)) {
			this.frm.doc.base_grand_total = (this.frm.doc.total_taxes_and_charges) ?
				flt(this.frm.doc.grand_total * this.frm.doc.conversion_rate) : this.frm.doc.base_net_total;
		} else {
			// other charges added/deducted
			this.frm.doc.taxes_and_charges_added = this.frm.doc.taxes_and_charges_deducted = 0.0;
			if(tax_count) {
				$.each(this.frm.doc["taxes"] || [], function(i, tax) {
					if (in_list(["Valuation and Total", "Total"], tax.category)) {
						if(tax.add_deduct_tax == "Add") {
							me.frm.doc.taxes_and_charges_added += flt(tax.tax_amount_after_discount_amount);
						} else {
							me.frm.doc.taxes_and_charges_deducted += flt(tax.tax_amount_after_discount_amount);
						}
					}
				})

				frappe.model.round_floats_in(this.frm.doc, ["taxes_and_charges_added", "taxes_and_charges_deducted"]);
			}

			this.frm.doc.base_grand_total = flt((this.frm.doc.taxes_and_charges_added || this.frm.doc.taxes_and_charges_deducted) ?
				flt(this.frm.doc.grand_total * this.frm.doc.conversion_rate) : this.frm.doc.base_net_total);

			this.set_in_company_currency(this.frm.doc, ["taxes_and_charges_added", "taxes_and_charges_deducted"]);
		}

		this.frm.doc.total_taxes_and_charges = flt(this.frm.doc.grand_total - this.frm.doc.net_total,
			precision("total_taxes_and_charges"));

		this.set_in_company_currency(this.frm.doc, ["total_taxes_and_charges"]);

		// Round grand total as per precision
		frappe.model.round_floats_in(this.frm.doc, ["grand_total", "base_grand_total"]);

		// rounded totals
		if(frappe.meta.get_docfield(this.frm.doc.doctype, "rounded_total", this.frm.doc.name)) {
			this.frm.doc.rounded_total = round_based_on_smallest_currency_fraction(this.frm.doc.grand_total, 
				this.frm.doc.currency, precision("rounded_total"));
		}
		if(frappe.meta.get_docfield(this.frm.doc.doctype, "base_rounded_total", this.frm.doc.name)) {
			var company_currency = this.get_company_currency();
			
			this.frm.doc.base_rounded_total = 
				round_based_on_smallest_currency_fraction(this.frm.doc.base_grand_total, 
					company_currency, precision("base_rounded_total"));
		}
	},

	_cleanup: function() {
		this.frm.doc.base_in_words = this.frm.doc.in_words = "";

		if(this.frm.doc["items"] && this.frm.doc["items"].length) {
			if(!frappe.meta.get_docfield(this.frm.doc["items"][0].doctype, "item_tax_amount", this.frm.doctype)) {
				$.each(this.frm.doc["items"] || [], function(i, item) {
					delete item["item_tax_amount"];
				});
			}
		}

		if(this.frm.doc["taxes"] && this.frm.doc["taxes"].length) {
			var temporary_fields = ["tax_amount_for_current_item", "grand_total_for_current_item",
				"tax_fraction_for_current_item", "grand_total_fraction_for_current_item"]

			if(!frappe.meta.get_docfield(this.frm.doc["taxes"][0].doctype, "tax_amount_after_discount_amount", this.frm.doctype)) {
				temporary_fields.push("tax_amount_after_discount_amount");
			}

			$.each(this.frm.doc["taxes"] || [], function(i, tax) {
				$.each(temporary_fields, function(i, fieldname) {
					delete tax[fieldname];
				});

				tax.item_wise_tax_detail = JSON.stringify(tax.item_wise_tax_detail);
			});
		}
	},

	apply_discount_amount: function() {
		var me = this;
		var distributed_amount = 0.0;

		if (this.frm.doc.discount_amount) {
			if(!this.frm.doc.apply_discount_on)
				frappe.throw(__("Please select Apply Discount On"));

			this.frm.set_value("base_discount_amount",
				flt(this.frm.doc.discount_amount * this.frm.doc.conversion_rate, precision("base_discount_amount")))

			var total_for_discount_amount = this.get_total_for_discount_amount();
			// calculate item amount after Discount Amount
			if (total_for_discount_amount) {
				$.each(this.frm.doc["items"] || [], function(i, item) {
					distributed_amount = flt(me.frm.doc.discount_amount) * item.net_amount / total_for_discount_amount;
					item.net_amount = flt(item.net_amount - distributed_amount, precision("base_amount", item));
					item.net_rate = flt(item.net_amount / item.qty, precision("net_rate", item));

					me.set_in_company_currency(item, ["net_rate", "net_amount"]);
				});

				this.discount_amount_applied = true;
				this._calculate_taxes_and_totals();
			}
		} else {
			this.frm.set_value("base_discount_amount", 0);
		}
	},

	get_total_for_discount_amount: function() {
		var me = this;

		if(this.frm.doc.apply_discount_on == "Net Total") {
			return this.frm.doc.net_total
		} else {
			var total_actual_tax = 0.0;
			var actual_taxes_dict = {};

			$.each(this.frm.doc["taxes"] || [], function(i, tax) {
				if (tax.charge_type == "Actual")
					actual_taxes_dict[tax.idx] = tax.tax_amount;
				else if (actual_taxes_dict[tax.row_id] !== null) {
					actual_tax_amount = flt(actual_taxes_dict[tax.row_id]) * flt(tax.rate) / 100;
					actual_taxes_dict[tax.idx] = actual_tax_amount;
				}
			});

			$.each(actual_taxes_dict, function(key, value) {
				if (value) total_actual_tax += value;
			});

			return flt(this.frm.doc.grand_total - total_actual_tax, precision("grand_total"));
		}
	},

	calculate_total_advance: function(update_paid_amount) {
		var total_allocated_amount = frappe.utils.sum($.map(this.frm.doc["advances"] || [], function(adv) {
			return flt(adv.allocated_amount, precision("allocated_amount", adv))
		}));
		this.frm.doc.total_advance = flt(total_allocated_amount, precision("total_advance"));

		this.calculate_outstanding_amount(update_paid_amount);
	},
	
	calculate_outstanding_amount: function(update_paid_amount) {
		// NOTE:
		// paid_amount and write_off_amount is only for POS Invoice
		// total_advance is only for non POS Invoice
		if(this.frm.doc.is_return || this.frm.doc.docstatus > 0) return;
		
		frappe.model.round_floats_in(this.frm.doc, ["grand_total", "total_advance", "write_off_amount"]);
		if(this.frm.doc.party_account_currency == this.frm.doc.currency) {	
			var total_amount_to_pay = flt((this.frm.doc.grand_total - this.frm.doc.total_advance 
				- this.frm.doc.write_off_amount), precision("grand_total"));
		} else {
			var total_amount_to_pay = flt(
				(flt(this.frm.doc.grand_total*this.frm.doc.conversion_rate, precision("grand_total")) 
					- this.frm.doc.total_advance - this.frm.doc.base_write_off_amount), 
				precision("base_grand_total")
			);
		}
		
		if(this.frm.doc.doctype == "Sales Invoice") {
			frappe.model.round_floats_in(this.frm.doc, ["paid_amount"]);
			
			if(this.frm.doc.is_pos) {
				if(!this.frm.doc.paid_amount || update_paid_amount===undefined || update_paid_amount) {
					this.frm.doc.paid_amount = flt(total_amount_to_pay);
				}
			} else {
				this.frm.doc.paid_amount = 0
			}
			this.set_in_company_currency(this.frm.doc, ["paid_amount"]);
			this.frm.refresh_field("paid_amount");
			this.frm.refresh_field("base_paid_amount");
			
			var paid_amount = (this.frm.doc.party_account_currency == this.frm.doc.currency) ? 
				this.frm.doc.paid_amount : this.frm.doc.base_paid_amount;
			
			var outstanding_amount =  flt(total_amount_to_pay - flt(paid_amount), 
				precision("outstanding_amount"));
				
		} else if(this.frm.doc.doctype == "Purchase Invoice") {
			var outstanding_amount = flt(total_amount_to_pay, precision("outstanding_amount"));
		}		
		this.frm.set_value("outstanding_amount", outstanding_amount);
	}
})

erpnext.feature_setup.feature_dict = {
	'fs_projects': {
		'BOM': {'fields':['project']},
		'Delivery Note': {'fields':['project']},
		'Purchase Invoice': {'items':['project']},
		'Production Order': {'fields':['project']},
		'Purchase Order': {'items':['project']},
		'Purchase Receipt': {'items':['project']},
		'Sales Invoice': {'fields':['project']},
		'Sales Order': {'fields':['project']},
		'Stock Entry': {'fields':['project']},
		'Timesheet': {'timesheet_details':['project']}
	},
	'fs_discounts': {
		'Delivery Note': {'items':['discount_percentage']},
		'Quotation': {'items':['discount_percentage']},
		'Sales Invoice': {'items':['discount_percentage']},
		'Sales Order': {'items':['discount_percentage','price_list_rate']}
	},
	'fs_purchase_discounts': {
		'Purchase Order': {'items':['base_price_list_rate', 'discount_percentage', 'price_list_rate']},
		'Purchase Receipt': {'items':['base_price_list_rate', 'discount_percentage', 'price_list_rate']},
		'Purchase Invoice': {'items':['base_price_list_rate', 'discount_percentage', 'price_list_rate']}
	},
	'fs_brands': {
		'Delivery Note': {'items':['brand']},
		'Material Request': {'items':['brand']},
		'Item': {'fields':['brand']},
		'Purchase Order': {'items':['brand']},
		'Purchase Invoice': {'items':['brand']},
		'Quotation': {'items':['brand']},
		'Sales Invoice': {'items':['brand']},
		'Product Bundle': {'fields':['new_item_brand']},
		'Sales Order': {'items':['brand']},
		'Serial No': {'fields':['brand']}
	},
	'fs_after_sales_installations': {
		'Delivery Note': {'fields':['installation_status','per_installed'],'items':['installed_qty']}
	},
	'fs_item_batch_nos': {
		'Delivery Note': {'items':['batch_no']},
		'Item': {'fields':['has_batch_no']},
		'Purchase Receipt': {'items':['batch_no']},
		'Quality Inspection': {'fields':['batch_no']},
		'Sales and Pruchase Return Wizard': {'return_details':['batch_no']},
		'Sales Invoice': {'items':['batch_no']},
		'Stock Entry': {'items':['batch_no']},
		'Stock Ledger Entry': {'fields':['batch_no']}
	},
	'fs_item_serial_nos': {
		'Warranty Claim': {'fields':['serial_no']},
		'Delivery Note': {'items':['serial_no'],'packed_items':['serial_no']},
		'Installation Note': {'items':['serial_no']},
		'Item': {'fields':['has_serial_no']},
		'Maintenance Schedule': {'items':['serial_no'],'schedules':['serial_no']},
		'Maintenance Visit': {'purposes':['serial_no']},
		'Purchase Receipt': {'items':['serial_no']},
		'Quality Inspection': {'fields':['item_serial_no']},
		'Sales and Pruchase Return Wizard': {'return_details':['serial_no']},
		'Sales Invoice': {'items':['serial_no']},
		'Stock Entry': {'items':['serial_no']},
		'Stock Ledger Entry': {'fields':['serial_no']}
	},
	'fs_item_barcode': {
		'Item': {'fields': ['barcode']},
		'Delivery Note': {'items': ['barcode']},
		'Sales Invoice': {'items': ['barcode']},
		'Stock Entry': {'items': ['barcode']},
		'Purchase Receipt': {'items': ['barcode']}
	},
	'fs_item_group_in_details': {
		'Delivery Note': {'items':['item_group']},
		'Opportunity': {'items':['item_group']},
		'Material Request': {'items':['item_group']},
		'Item': {'fields':['item_group']},
		'Global Defaults': {'fields':['default_item_group']},
		'Purchase Order': {'items':['item_group']},
		'Purchase Receipt': {'items':['item_group']},
		'Purchase Voucher': {'items':['item_group']},
		'Quotation': {'items':['item_group']},
		'Sales Invoice': {'items':['item_group']},
		'Product Bundle': {'fields':['serial_no']},
		'Sales Order': {'items':['item_group']},
		'Serial No': {'fields':['item_group']},
		'Sales Partner': {'targets':['item_group']},
		'Sales Person': {'targets':['item_group']},
		'Territory': {'targets':['item_group']}
	},
	'fs_page_break': {
		'Delivery Note': {'items':['page_break'],'packed_items':['page_break']},
		'Material Request': {'items':['page_break']},
		'Purchase Order': {'items':['page_break']},
		'Purchase Receipt': {'items':['page_break']},
		'Purchase Voucher': {'items':['page_break']},
		'Quotation': {'items':['page_break']},
		'Sales Invoice': {'items':['page_break']},
		'Sales Order': {'items':['page_break']}
	},
	'fs_exports': {
		'Delivery Note': {
			'fields': ['conversion_rate','currency','base_grand_total','base_in_words','base_rounded_total',
				'base_total', 'base_net_total', 'base_discount_amount', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'POS Profile': {'fields':['conversion_rate','currency']},
		'Quotation': {
			'fields': ['conversion_rate','currency','base_grand_total','base_in_words','base_rounded_total',
				'base_total', 'base_net_total', 'base_discount_amount', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'Sales Invoice': {
			'fields': ['conversion_rate','currency','base_grand_total','base_in_words','base_rounded_total',
				'base_total', 'base_net_total', 'base_discount_amount', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'Product Bundle': {'fields':['currency']},
		'Sales Order': {
			'fields': ['conversion_rate','currency','base_grand_total','base_in_words','base_rounded_total',
				'base_total', 'base_net_total', 'base_discount_amount', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		}
	},

	'fs_imports': {
		'Purchase Invoice': {
			'fields': ['conversion_rate', 'currency', 'base_grand_total', 'base_discount_amount',
		 		'base_in_words', 'base_total', 'base_net_total', 'base_taxes_and_charges_added',
		 		'base_taxes_and_charges_deducted', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate', 'base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'Purchase Order': {
			'fields': ['conversion_rate','currency', 'base_grand_total', 'base_discount_amount',
				'base_in_words', 'base_total', 'base_net_total', 'base_taxes_and_charges_added',
			 	'base_taxes_and_charges_deducted', 'base_total_taxes_and_charges'],
			'items': ['base_price_list_rate', 'base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'Purchase Receipt': {
			'fields': ['conversion_rate', 'currency','base_grand_total', 'base_in_words', 'base_total',
			 	'base_net_total', 'base_taxes_and_charges_added', 'base_taxes_and_charges_deducted',
				'base_total_taxes_and_charges', 'base_discount_amount'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		},
		'Supplier Quotation': {
			'fields': ['conversion_rate', 'currency','base_grand_total', 'base_in_words', 'base_total',
			 	'base_net_total', 'base_taxes_and_charges_added', 'base_taxes_and_charges_deducted',
				'base_total_taxes_and_charges', 'base_discount_amount'],
			'items': ['base_price_list_rate','base_amount','base_rate', 'base_net_rate', 'base_net_amount']
		}
	},

	'fs_item_advanced': {
		'Item': {'fields':['customer_items']}
	},
	'fs_sales_extras': {
		'Address': {'fields':['sales_partner']},
		'Contact': {'fields':['sales_partner']},
		'Customer': {'fields':['sales_team']},
		'Delivery Note': {'fields':['sales_team']},
		'Item': {'fields':['customer_items']},
		'Sales Invoice': {'fields':['sales_team']},
		'Sales Order': {'fields':['sales_team']}
	},
	'fs_more_info': {
		"Warranty Claim": {"fields": ["more_info"]},
		'Material Request': {'fields':['more_info']},
		'Lead': {'fields':['more_info']},
		'Opportunity': {'fields':['more_info']},
		'Purchase Invoice': {'fields':['more_info']},
		'Purchase Order': {'fields':['more_info']},
		'Purchase Receipt': {'fields':['more_info']},
		'Supplier Quotation': {'fields':['more_info']},
		'Quotation': {'fields':['more_info']},
		'Sales Invoice': {'fields':['more_info']},
		'Sales Order': {'fields':['more_info']},
		'Delivery Note': {'fields':['more_info']},
	},
	'fs_quality': {
		'Item': {'fields':['inspection_criteria','inspection_required']},
		'Purchase Receipt': {'items':['qa_no']}
	},
	'fs_manufacturing': {
		'Item': {'fields':['manufacturing']}
	},
	'fs_pos': {
		'Sales Invoice': {'fields':['is_pos']}
	},
	'fs_recurring_invoice': {
		'Sales Invoice': {'fields': ['recurring_invoice']}
	}
}

