sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension"
], function (ControllerExtension) {
    "use strict";

    return ControllerExtension.extend("zattach.zattachfe.ext.controller.ListReportExt", {
        
        onCreateAttachment: function () {
            // Navigate to create page using the Extension API
            this.base.getExtensionAPI().getRouting().navigateToRoute("CreateAttachment");
        }
    });
});
