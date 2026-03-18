sap.ui.define([
], function () {
    "use strict";

    var ListReportExt = {
        
        onCreateAttachment: function () {
            // Navigate to create page using the Extension API
            this.getExtensionAPI().getRouting().navigateToRoute("CreateAttachment");
        }
    };
    
    return ListReportExt;
});
