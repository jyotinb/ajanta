
cur_frm.cscript.unit1_quantity = function(doc, cdt, cdn) 
	{ 
		var e = locals[cdt][cdn];
		result_value = d.unit1_quantity * d.unit1_to_unit2_multiplier;
		frappe.model.set_value(cdt, cdn, "qty", result_value);
		//this.aaa_bbb();
	}

cur_frm.cscript.unit2_quantity = function(doc, cdt, cdn) 
	{
	var e = locals[cdt][cdn];
	result_value = e.unit2_quantity ;
	frappe.model.set_value(cdt, cdn, "qty", result_value);
	// cur_frm.script_manager.trigger("other_discount_type");
	}



cur_frm.cscript.transaction_type= function(doc, cdt, cdn) 
	{ 
	var d = locals[cdt][cdn];
	transaction_type = d.transaction_type ;
	price_list_rate=d.price_list_rate;
	if(transaction_type=="Replacement" | transaction_type=="Free"){
		frappe.model.set_value(cdt, cdn, "rate", 0);
		frappe.model.set_value(cdt, cdn, "spl_discount_rate", 0);
		frappe.model.set_value(cdt, cdn, "other_discount_rate", 0);		
		var df = frappe.meta.get_docfield("Sales Order Item","other_discount_rate", cur_frm.doc.name);
		df.read_only = 1;
		var df = frappe.meta.get_docfield("Sales Order Item","spl_discount_rate", cur_frm.doc.name);
		df.read_only = 1;
		}
	if(transaction_type=="Sales"){
		frappe.model.set_value(cdt, cdn, "rate", price_list_rate);
        var df = frappe.meta.get_docfield("Sales Order Item","other_discount_rate", cur_frm.doc.name);
		df.read_only = 0;
		var df = frappe.meta.get_docfield("Sales Order Item","spl_discount_rate", cur_frm.doc.name);
		df.read_only = 0;		
		}			
		cur_frm.cscript.calculate_taxes_and_totals();
	}
	

function aaa_bbb(doc, cdt, cdn){ 
	
	var d = locals[cdt][cdn];
    //msgprint(d.qty);
    price_list_rate=d.price_list_rate;
    rate=d.rate;
	spl_discount_type = d.spl_discount_type ;
    spl_discount_rate = d.spl_discount_rate | 0 ;
	spl_discount = d.spl_discount | 0;
	other_discount_type = d.other_discount_type ;
	other_discount_rate = d.other_discount_rate |0 ;
	other_discount = d.other_discount |0 ;
	qty = d.qty |0;
	amount=flt(0.0,2);
	
	amount=flt((flt(d.rate,2) * flt(d.qty,2))) ;
	msgprint(amount);
	if(spl_discount_type=="%") {             
		spl_discount=flt(flt(d.rate,2) * (flt(spl_discount_rate,2) /100 ) * flt(qty,2));	
		}
	if(spl_discount_type=="x Qty") {
	    spl_discount=flt(flt(qty,2) * flt(spl_discount_rate,2));
		}
	if(spl_discount_type=="Fixed") {
	    spl_discount= flt(spl_discount_rate,2);
		}
	if(other_discount_type=="%") {    
		other_discount=flt(flt(d.rate,2) * (flt(other_discount_rate,2) /100 ) * flt(qty,2));	
		}
	if(other_discount_type=="x Qty") {
	    other_discount=flt(flt(qty,2) * flt(other_discount_rate,2));
		}
	if(other_discount_type=="Fixed") {
	    other_discount= flt(other_discount_rate,2);
		}
		
    amount = flt(flt(amount,2) - flt(spl_discount,2) - flt(other_discount,2),2);
	msgprint(amount);
	frappe.model.set_value(cdt, cdn, "spl_discount", spl_discount);
	frappe.model.set_value(cdt, cdn, "other_discount", other_discount);
    	
	cur_frm.cscript.calculate_taxes_and_totals();
	frappe.model.set_value(cdt, cdn, "amount", amount);
	frappe.model.set_value(cdt, cdn, "net_amount", amount);
	frappe.model.set_value(cdt, cdn, "base_amount", amount);
	frappe.model.set_value(cdt, cdn, "base_net_amount", amount);
        cur_frm.cscript.calculate_net_total();
	}

cur_frm.cscript.other_discount_type = aaa_bbb;
cur_frm.cscript.other_discount_rate = aaa_bbb;

cur_frm.cscript.spl_discount_rate = aaa_bbb;
cur_frm.cscript.spl_discount_type = aaa_bbb;
cur_frm.cscript.qty = aaa_bbb;

	
cur_frm.add_fetch('item_code','unit1_to_unit2_multiplier','unit1_to_unit2_multiplier');
cur_frm.add_fetch('item_code','mrp_dlp','mrp_dlp');
cur_frm.add_fetch('item_price','d_l_p','d_l_p');
cur_frm.add_fetch('item_code','unit_1','unit1');
cur_frm.add_fetch('item_code','unit_2','unit2');

frappe.ui.form.on("Sales Order","onload", function(frm, cdt, cdn) { 
    var df = frappe.meta.get_docfield("Sales Order Item","qty", cur_frm.doc.name);
    df.read_only = 1;
	var df = frappe.meta.get_docfield("Sales Order Item","rate", cur_frm.doc.name);
    df.read_only = 1;
	var df = frappe.meta.get_docfield("Sales Order Item","other_discount", cur_frm.doc.name);
    df.read_only = 1;
	var df = frappe.meta.get_docfield("Sales Order Item","spl_discount", cur_frm.doc.name);
    df.read_only = 1;

});

frappe.ui.form.on("Sales Order", "refresh", function(frm, doctype, name) 
	{
		cur_frm.fields_dict['items'].grid.get_field("item_code").get_query = function(doc, cdt, cdn) 
		{
			var item = frappe.get_doc(cdt, cdn);
			var c = " ";
			if (item.brand_name) c=item.brand_name 
            return {query: "erpnext.controllers.queries.item_query", filters: {'brand': c}} 
		}
	}
);		
						
frappe.ui.form.on("Sales Order", "refresh", function(frm, doctype, name) 
	{
		cur_frm.get_field("customer").get_query = function(doc, cdt, cdn) 
		{
			var item = frappe.get_doc(cdt, cdn);
			var c = " ";
                        if (item.sales_person) c=item.sales_person ;
            return {query: "ajanta.ajanta.doctype.city.city.customer_query", filters: {'sales_person': c}} 
		}
	}
);		
									
cur_frm.fields_dict['items'].grid.get_field('location').get_query = function(doc, cdt, cdn) {
var item = locals[cdt][cdn];
var filters = { 'item': item.item_code      } ;
		return {
			filters: filters
		       }
};

frappe.ui.form.on("Sales Order", "validate", function(frm, cdt, cdn) {
	// code for calculate total and set on parent field.
	total_disc = 0;
	total = frm.doc.base_net_total;
	$.each(frm.doc.items || [], function(i, d) {
		total_disc += flt(d.spl_discount+d.other_discount);
	});
	total -= total_disc
	frm.set_value("base_net_total", total);
})

