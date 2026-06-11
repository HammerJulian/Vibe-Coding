sap.ui.define([
    "sap/dm/dme/pod2/action/Action",
    "sap/dm/dme/pod2/action/metadata/ActionProperty",
    "sap/dm/dme/pod2/context/PodContext",
    "sap/dm/dme/pod2/propertyeditor/StringPropertyEditor"
], (
    Action,
    ActionProperty,
    PodContext,
    StringPropertyEditor
) => {
    "use strict";

    class SetVariableAction extends Action {

        static getDisplayName() {
            return "Pod Context Toggle Action";
        }

        static getDescription() {
            return "Toggles a custom POD Context variable between true and false.";
        }

        static getIcon() {
            return "sap-icon://write-new";
        }

        /**
         * Configurable properties shown in the POD editor.
         * @override
         * @returns {Array<sap.dm.dme.pod2.action.metadata.ActionProperty>}
         */
        getProperties() {
            return [
                new ActionProperty({
                    displayName: "Context Path",
                    description: "The POD Context path to toggle (e.g. /custom/assembleActive). Must start with /custom/ to avoid conflicts with core paths.",
                    propertyEditor: new StringPropertyEditor(this, "contextPath")
                })
            ];
        }

        /**
         * @override
         * @param {sap.dm.dme.pod2.action.ActionContext} oActionContext
         */
        execute(oActionContext) {
            // Use the configured path, fall back to default if not set
            const sPath = this.getPropertyValue("contextPath") || "/custom/myVariable";

            if (!sPath.startsWith("/")) {
                console.error(`[SetVariableAction] Invalid path '${sPath}': must start with '/'.`);
                return;
            }

            const bCurrent = PodContext.get(sPath);
            // null → true, false → true, true → false
            const bNew = !bCurrent;
            PodContext.set(sPath, bNew);
            console.info(`[SetVariableAction] Toggled '${sPath}': ${bCurrent} → ${bNew}`);
        }
    }

    return SetVariableAction;
});
