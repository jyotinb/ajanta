# -*- coding: utf-8 -*-
from __future__ import unicode_literals

app_name = "ajanta"
app_title = "Ajanta"
app_publisher = "drkds"
app_description = "custom_erpnext"
app_icon = "octicon octicon-file-directory"
app_color = "grey"
app_email = "jyotinb@yahoo.com"
app_version = "0.0.1"
app_license = "MIT"
fixtures = ["Custom Field",
"Property Setter",
"DocType",
"Custom Script",
"Print Format",
"City",
"District",
"State",
"Tehsil",
"Employee",
"Sales Person"
]
standard_queries = {
	"Customer": "erpnext.controllers.queries.customer_query"
}

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/ajanta/css/ajanta.css"
# app_include_js = "/assets/ajanta/js/ajanta.js"

# include js, css files in header of web template
# web_include_css = "/assets/ajanta/css/ajanta.css"
# web_include_js = "/assets/ajanta/js/ajanta.js"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Website user home page (by function)
# get_website_user_home_page = "ajanta.utils.get_home_page"

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Installation
# ------------

# before_install = "ajanta.install.before_install"
# after_install = "ajanta.install.after_install"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "ajanta.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"ajanta.tasks.all"
# 	],
# 	"daily": [
# 		"ajanta.tasks.daily"
# 	],
# 	"hourly": [
# 		"ajanta.tasks.hourly"
# 	],
# 	"weekly": [
# 		"ajanta.tasks.weekly"
# 	]
# 	"monthly": [
# 		"ajanta.tasks.monthly"
# 	]
# }

# Testing
# -------

# before_tests = "ajanta.install.before_tests"

# Overriding Whitelisted Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "ajanta.event.get_events"
# }

