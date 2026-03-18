sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Format file size to human readable format
         * @param {number} iSize - Size in bytes
         * @returns {string} Formatted size string
         */
        formatFileSize: function (iSize) {
            if (!iSize || iSize === 0) {
                return "0 Bytes";
            }

            var aUnits = ["Bytes", "KB", "MB", "GB"];
            var iUnitIndex = Math.floor(Math.log(iSize) / Math.log(1024));
            var fSize = iSize / Math.pow(1024, iUnitIndex);
            
            return fSize.toFixed(2) + " " + aUnits[iUnitIndex];
        },

        /**
         * Format date to readable format
         * @param {string} sDate - Date string
         * @returns {string} Formatted date
         */
        formatDate: function (sDate) {
            if (!sDate) {
                return "";
            }
            var oDateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
                pattern: "dd/MM/yyyy HH:mm:ss"
            });
            return oDateFormat.format(new Date(sDate));
        },

        /**
         * Format boolean to Yes/No
         * @param {boolean} bValue
         * @returns {string}
         */
        formatBoolean: function (bValue) {
            if (typeof bValue === "string") {
                var sNormalizedValue = bValue.trim().toLowerCase();

                if (sNormalizedValue === "true" || sNormalizedValue === "x" || sNormalizedValue === "yes" || sNormalizedValue === "1") {
                    return "Yes";
                }

                if (sNormalizedValue === "false" || sNormalizedValue === "" || sNormalizedValue === "no" || sNormalizedValue === "0") {
                    return "No";
                }
            }

            if (typeof bValue === "number") {
                return bValue === 1 ? "Yes" : "No";
            }

            return bValue === true ? "Yes" : "No";
        }
    };
});
