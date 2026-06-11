sap.ui.define([
    "sap/dm/dme/pod2/widget/Widget",
    "sap/dm/dme/pod2/widget/metadata/WidgetProperty",
    "sap/dm/dme/pod2/propertyeditor/StringPropertyEditor",
    "sap/dm/dme/pod2/propertyeditor/PropertyCategory",
    "sap/dm/dme/pod2/context/PodContext",
    "sap/m/Button",
    "sap/m/Dialog",
    "sap/m/FlexBox",
    "sap/m/Label",
    "sap/m/MessageStrip",
    "sap/m/Panel",
    "sap/m/SegmentedButton",
    "sap/m/SegmentedButtonItem",
    "sap/m/Text",
    "sap/m/TextArea",
    "sap/m/Title",
    "sap/m/Toolbar",
    "sap/m/ToolbarSpacer",
    "sap/ui/core/HTML",
    "sap/m/Select",
    "sap/ui/core/Item"
], (
    Widget,
    WidgetProperty,
    StringPropertyEditor,
    PropertyCategory,
    PodContext,
    Button,
    Dialog,
    FlexBox,
    Label,
    MessageStrip,
    Panel,
    SegmentedButton,
    SegmentedButtonItem,
    Text,
    TextArea,
    Title,
    Toolbar,
    ToolbarSpacer,
    HTML,
    Select,
    Item
) => {
    "use strict";

    const COMPONENT_PATH = "/custom/selectedComponent";

    class NcReworkWidget extends Widget {

        #oPanel = null;
        #oMessageStrip = null;
        #oCanvas = null;
        #oHtml = null;
        #oLegendBox = null;
        #oCompSelect = null;
        #sCanvasId = null;
        #aMarkings = [];
        #aAllNcs = [];
        #sFilter = "ALL"; // ALL, OPEN, CLOSED
        // Zoom & Pan
        #fZoom = 1;
        #fPanX = 0;
        #fPanY = 0;
        #bDragging = false;
        #oDragStart = null;

        static getDisplayName() {
            return "NC Rework Anzeige";
        }

        static getDescription() {
            return "Zeigt NC Positionen auf der Platine. Offen=Rot, Erledigt=Grün. NC direkt schließen möglich.";
        }

        static getIcon() {
            return "sap-icon://hint";
        }

        static getCategory() {
            return "Custom Widgets";
        }

        static getDefaultConfig() {
            return { properties: { komponenten: "" } };
        }

        getProperties() {
            return [
                new WidgetProperty({
                    displayName: "Komponenten",
                    description: "Pipe-getrennte Liste: Name=URL|Name2=URL2 – identisch zur NcMarkingWidget-Konfiguration.",
                    category: "General",
                    propertyEditor: new StringPropertyEditor(this, "komponenten")
                })
            ];
        }

        // ── Komponenten parsen ───────────────────────────────────────────

        #parseKomponenten() {
            const sRaw = this.getPropertyValue("komponenten") || "";
            return sRaw.split("|").map(s => s.trim()).filter(Boolean).map(s => {
                const iEq = s.indexOf("=");
                if (iEq < 0) return null;
                return { label: s.substring(0, iEq).trim(), url: s.substring(iEq + 1).trim() };
            }).filter(Boolean);
        }

        _createView() {
            this.#sCanvasId = this.getId() + "-rework-canvas";

            // ── Message Strip ─────────────────────────────────────────────
            this.#oMessageStrip = new MessageStrip({
                visible: false,
                showCloseButton: true,
                type: "Information"
            }).addStyleClass("sapUiSmallMarginBeginEnd");

            // ── Filter Segmented Button ───────────────────────────────────
            const oFilter = new SegmentedButton({
                selectedKey: "ALL",
                selectionChange: (oEvent) => {
                    this.#sFilter = oEvent.getParameter("item").getKey();
                    this.#drawCanvas(this._platineImg);
                    this.#updateLegend();
                },
                items: [
                    new SegmentedButtonItem({ key: "ALL",    text: "Alle" }),
                    new SegmentedButtonItem({ key: "OPEN",   text: "Offen" }),
                    new SegmentedButtonItem({ key: "CLOSED", text: "Geschlossen" })
                ]
            });

            // ── Komponenten-Dropdown ─────────────────────────────────────
            this.#oCompSelect = new Select({
                width: "220px",
                forceSelection: false,
                change: this.#onComponentChanged.bind(this)
            });
            this.#oCompSelect.addItem(new Item({ key: "", text: "– Komponente –" }));

            // ── Toolbar ───────────────────────────────────────────────────
            const oToolbar = new Toolbar({
                content: [
                    new Title({ text: "NC Rework Anzeige" }),
                    new ToolbarSpacer(),
                    this.#oCompSelect,
                    oFilter,
                    new Button({
                        text: "Aktualisieren",
                        icon: "sap-icon://refresh",
                        press: this.#loadFromApi.bind(this)
                    })
                ]
            });

            // ── Legend ────────────────────────────────────────────────────
            this.#oLegendBox = new FlexBox({
                alignItems: "Center",
                wrap: "Wrap",
                items: []
            }).addStyleClass("sapUiSmallMargin");

            // ── Canvas ────────────────────────────────────────────────────
            const sHtml =
                '<div style="position:relative; display:inline-block; margin:8px 16px; width:calc(100% - 32px);">' +
                '<canvas id="' + this.#sCanvasId + '" width="800" height="516" ' +
                'style="border:2px solid #ccc; border-radius:4px; width:100%; cursor:pointer;">' +
                '</canvas>' +
                '<div id="' + this.#sCanvasId + '-tooltip" ' +
                'style="position:absolute; background:rgba(20,20,20,0.95); color:white; ' +
                'padding:10px 14px; border-radius:8px; font-size:13px; display:none; pointer-events:none; ' +
                'min-width:160px; max-width:260px; box-shadow:0 2px 8px rgba(0,0,0,0.5); line-height:1.5;">' +
                '</div>' +
                '</div>';

            this.#oHtml = new HTML({
                content: sHtml,
                afterRendering: this.#onAfterRendering.bind(this)
            });

            this.#oPanel = new Panel(this.getId(), {
                headerToolbar: oToolbar,
                content: [
                    this.#oMessageStrip,
                    this.#oLegendBox,
                    this.#oHtml
                ]
            });

            this.#oPanel.addEventDelegate({
                onAfterRendering: () => {
                    const oDomRef = this.#oPanel.getDomRef();
                    if (oDomRef && !this.#aMarkings.length) {
                        oDomRef.style.display = "none";
                    }
                }
            });

            return this.#oPanel;
        }

        onInit() {
            super.onInit && super.onInit();

            this._aSfcPaths = [
                "/workList/selected/0/sfc",
                "/workList/selected",
                "/SelectedWorkListItems"
            ];

            this._aSfcPaths.forEach(sPath => {
                PodContext.subscribe(sPath, (vValue) => {
                    if (vValue !== undefined && vValue !== null) {
                        this._bPendingLoad = true;
                        if (this.#oCanvas && this._platineImg) {
                            this._bPendingLoad = false;
                            this.#loadFromApi();
                        }
                    }
                }, this);
            });

            // Wenn NcMarkingWidget Komponente wechselt → hier mitziehen
            PodContext.subscribe(COMPONENT_PATH, (oComp) => {
                if (!oComp || !oComp.url) return;
                if (this.#oCompSelect) this.#oCompSelect.setSelectedKey(oComp.url);
                this.#loadImage(oComp.url, () => this.#showMarkingsForComponent(oComp.url));
            }, this);
        }

        onExit() {
            if (this._aSfcPaths) {
                this._aSfcPaths.forEach(sPath => {
                    try { PodContext.unsubscribe(sPath, this); } catch (e) { /* ignorieren */ }
                });
            }
            try { PodContext.unsubscribe(COMPONENT_PATH, this); } catch (e) { /* ignorieren */ }
            super.onExit && super.onExit();
        }

        #onAfterRendering() {
            this.#oCanvas = document.getElementById(this.#sCanvasId);
            if (!this.#oCanvas) return;

            this.#oCanvas.addEventListener("mousemove",  this.#onMouseMove.bind(this));
            this.#oCanvas.addEventListener("mouseleave", this.#onMouseLeave.bind(this));
            this.#oCanvas.addEventListener("click",      this.#onCanvasClick.bind(this));
            this.#oCanvas.addEventListener("wheel",      this.#onWheel.bind(this),      { passive: false });
            this.#oCanvas.addEventListener("mousedown",  this.#onDragStart.bind(this));
            this.#oCanvas.addEventListener("mouseup",    this.#onDragEnd.bind(this));
            this.#oCanvas.addEventListener("dblclick",   this.#onDblClick.bind(this));
            this.#oCanvas.style.cursor = "grab";

            // NCs laden → Dropdown befüllen → Bild der aktiven Komponente laden
            this.#loadFromApi();
        }

        // ── Komponente gewählt ───────────────────────────────────────────

        #onComponentChanged() {
            const sUrl = this.#oCompSelect.getSelectedKey();
            if (!sUrl) return;
            this.#loadImage(sUrl, () => this.#showMarkingsForComponent(sUrl));
        }

        // ── Bild laden ────────────────────────────────────────────────────

        #loadImage(sUrl, fnCallback) {
            if (!sUrl || !this.#oCanvas) return;
            const img = new Image();
            img.onload = () => {
                this._platineImg = img;
                this.#oCanvas.width  = img.naturalWidth  || 800;
                this.#oCanvas.height = img.naturalHeight || 516;
                this.#fZoom = 1; this.#fPanX = 0; this.#fPanY = 0;
                this.#drawCanvas(img);
                this._bPendingLoad = false;
                if (fnCallback) fnCallback();
            };
            img.onerror = () => console.warn("[NcReworkWidget] Bild konnte nicht geladen werden:", sUrl);
            img.src = sUrl;
        }

        // ── Dropdown aus geloggten Komponenten-URLs befüllen ──────────────

        #rebuildComponentDropdown() {
            if (!this.#oCompSelect) return;
            const aKonfig = this.#parseKomponenten();
            const aUrls = [...new Set(this.#aAllNcs.map(n => n.componentUrl).filter(Boolean))];

            this.#oCompSelect.removeAllItems();
            this.#oCompSelect.addItem(new Item({ key: "", text: "– Komponente –" }));

            if (aUrls.length === 0) {
                // Keine URLs geloggt → alle konfigurierten Komponenten zeigen
                aKonfig.forEach(o => this.#oCompSelect.addItem(new Item({ key: o.url, text: o.label })));
            } else {
                // Nur Komponenten mit NCs, Label aus Konfiguration
                aUrls.forEach(sUrl => {
                    const oK = aKonfig.find(k => k.url === sUrl);
                    const sLabel = oK ? oK.label
                        : (this.#aAllNcs.find(n => n.componentUrl === sUrl)?.componentLabel || sUrl);
                    this.#oCompSelect.addItem(new Item({ key: sUrl, text: sLabel }));
                });
            }
        }

        // ── Markierungen für gewählte Komponente anzeigen ─────────────────

        #showMarkingsForComponent(sUrl) {
            this.#aMarkings = sUrl
                ? this.#aAllNcs.filter(n => n.componentUrl === sUrl)
                : this.#aAllNcs;
            this.#drawCanvas(this._platineImg);
            this.#updateLegend();
            if (this.#oPanel && this.#oPanel.getDomRef()) {
                        this.#oPanel.getDomRef().style.display = this.#aMarkings.length > 0 ? "" : "none";
                    }
            if (this.#aMarkings.length > 0) {
                this.#showMessage(this.#aMarkings.length + " NC(s) für diese Komponente.", "Success");
            } else {
                this.#showMessage("Keine NCs für diese Komponente.", "Information");
            }
        }

        // ── Zoom & Pan Events ─────────────────────────────────────────

        #onWheel(oEvent) {
            oEvent.preventDefault();
            if (!this.#oCanvas) return;
            const oRect = this.#oCanvas.getBoundingClientRect();
            const fMx = (oEvent.clientX - oRect.left) / oRect.width  * this.#oCanvas.width;
            const fMy = (oEvent.clientY - oRect.top)  / oRect.height * this.#oCanvas.height;
            const fDelta = oEvent.deltaY > 0 ? 0.85 : 1.18;
            const fNewZoom = Math.min(10, Math.max(1, this.#fZoom * fDelta));
            this.#fPanX = fMx - (fMx - this.#fPanX) * (fNewZoom / this.#fZoom);
            this.#fPanY = fMy - (fMy - this.#fPanY) * (fNewZoom / this.#fZoom);
            this.#fZoom = fNewZoom;
            this.#clampPan();
            this.#drawCanvas(this._platineImg);
        }

        #onDragStart(oEvent) {
            this.#bDragging = true;
            this.#oDragStart = { x: oEvent.clientX - this.#fPanX, y: oEvent.clientY - this.#fPanY };
            this.#oCanvas.style.cursor = "grabbing";
        }

        #onDragEnd() {
            this.#bDragging = false;
            this.#oDragStart = null;
            this.#oCanvas.style.cursor = "grab";
        }

        #onDblClick() {
            this.#fZoom = 1;
            this.#fPanX = 0;
            this.#fPanY = 0;
            this.#drawCanvas(this._platineImg);
        }

        #clampPan() {
            if (!this.#oCanvas) return;
            const iW = this.#oCanvas.width;
            const iH = this.#oCanvas.height;
            this.#fPanX = Math.min(0, Math.max(-iW * (this.#fZoom - 1), this.#fPanX));
            this.#fPanY = Math.min(0, Math.max(-iH * (this.#fZoom - 1), this.#fPanY));
        }

        #onMouseLeave() {
            if (this.#bDragging) this.#onDragEnd();
            const oTip = document.getElementById(this.#sCanvasId + "-tooltip");
            if (oTip) oTip.style.display = "none";
        }

        // ── Load from API ─────────────────────────────────────────────────

        async #loadFromApi() {
            try {
                const vPlant = PodContext.get("/plant")
                    || PodContext.get("/podConfig/plant")
                    || PodContext.get("/plantConfig/plant");
                const sPlant = this.#extractPlant(vPlant);

                let sSfc = PodContext.get("/workList/selected/0/sfc") || PodContext.get("/selectedSfc");
                if (!sSfc) {
                    const vSel = PodContext.get("/SelectedWorkListItems");
                    if (Array.isArray(vSel) && vSel[0]) sSfc = vSel[0].sfc || null;
                }

                if (!sPlant || !sSfc) {
                    this.#showMessage("Plant oder SFC nicht gefunden.", "Warning");
                    return;
                }

                const sCurrentPath = window.location.pathname;
                const oPathMatch = sCurrentPath.match(/\/sapdmdmepod2\/~([^~]+)~/);
                const sSessionId = oPathMatch ? oPathMatch[1] : null;

                const sUrl = sSessionId
                    ? "/sapdmdmepod2/~" + sSessionId + "~/dme/nonconformance-ms/api/nonconformance/v1/nonconformances"
                      + "?plant=" + encodeURIComponent(sPlant) + "&sfc=" + encodeURIComponent(sSfc)
                    : "/nonconformance/v1/nonconformances"
                      + "?plant=" + encodeURIComponent(sPlant) + "&sfc=" + encodeURIComponent(sSfc);

                console.info("[NcReworkWidget] GET:", sUrl);

                const oResp = await fetch(sUrl, {
                    method: "GET",
                    headers: { "Accept": "application/json", "X-Dme-Plant": sPlant, "X-Dme-Industry-Type": "DISCRETE" },
                    credentials: "include"
                });
                if (!oResp.ok) { this.#showMessage("Fehler beim Laden der NC-Daten: " + oResp.status, "Error"); return; }

                const aData = await oResp.json();
                const aNcs = Array.isArray(aData) ? aData : (aData.content || aData.value || []);

                // Alle NCs mit Position parsen inkl. Komponenten-URL
                this.#aAllNcs = aNcs.map(oNc => {
                    const aF    = oNc.dataFields || [];
                    const oX    = aF.find(f => f.key === "POSITION_X");
                    const oY    = aF.find(f => f.key === "POSITION_Y");
                    const oCUrl = aF.find(f => f.key === "COMPONENT_URL_1");
                    const oCLbl = aF.find(f => f.key === "COMPONENT_1");
                    const oCmt  = aF.find(f => f.key === "COMMENT");
                    if (!oX || !oY) return null;
                    const sNcCode = typeof oNc.code === "object"
                        ? (oNc.code.code || oNc.code.name || "?") : (oNc.code || "?");
                    return {
                        ncCode:         sNcCode,
                        x:              parseFloat(oX.value),
                        y:              parseFloat(oY.value),
                        state:          oNc.state || "OPEN",
                        id:             oNc.id,
                        plant:          sPlant,
                        comment:        oCmt  ? oCmt.value  : "",
                        componentUrl:   oCUrl ? oCUrl.value : "",
                        componentLabel: oCLbl ? oCLbl.value : ""
                    };
                }).filter(Boolean);

                // Dropdown: nur Komponenten die tatsächlich NCs haben
                this.#rebuildComponentDropdown();

                // Aktive Komponente aus Context oder erste mit NCs
                const oActive = PodContext.get(COMPONENT_PATH);
                const sActiveUrl = (oActive && oActive.url) ? oActive.url : "";
                const aUrls = [...new Set(this.#aAllNcs.map(n => n.componentUrl).filter(Boolean))];
                const sSelect = (sActiveUrl && aUrls.includes(sActiveUrl))
                    ? sActiveUrl : (aUrls[0] || "");

                if (sSelect) {
                    if (this.#oCompSelect) this.#oCompSelect.setSelectedKey(sSelect);
                    this.#loadImage(sSelect, () => this.#showMarkingsForComponent(sSelect));
                } else {
                    // Keine Komponenten-URL geloggt → alle NCs + erstes konfig. Bild laden
                    this.#aMarkings = this.#aAllNcs;
                    const aKonfig = this.#parseKomponenten();
                    if (aKonfig.length > 0) {
                        this.#loadImage(aKonfig[0].url, () => {
                            this.#drawCanvas(this._platineImg);
                            this.#updateLegend();
                        });
                        if (this.#oCompSelect) this.#oCompSelect.setSelectedKey(aKonfig[0].url);
                    } else {
                        this.#drawCanvas(this._platineImg);
                        this.#updateLegend();
                    }
                    if (this.#oPanel && this.#oPanel.getDomRef()) {
                        this.#oPanel.getDomRef().style.display = this.#aMarkings.length > 0 ? "" : "none";
                    }
                }

            } catch (oErr) {
                this.#showMessage("Fehler: " + oErr.message, "Error");
                console.error("[NcReworkWidget]", oErr);
            }
        }

        // ── Legend ────────────────────────────────────────────────────────

        #updateLegend() {
            if (!this.#oLegendBox) return;
            this.#oLegendBox.removeAllItems();

            const aFiltered = this.#getFilteredMarkings();

            // Color indicators
            const oRedDot = new HTML({ content: '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:#DC3232; margin-right:6px; vertical-align:middle;"></span>' });
            const oRedLabel = new Text({ text: "Offen" }).addStyleClass("sapUiSmallMarginEnd");
            const oGreenDot = new HTML({ content: '<span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:#2E8B57; margin-right:6px; margin-left:12px; vertical-align:middle;"></span>' });
            const oGreenLabel = new Text({ text: "Geschlossen" }).addStyleClass("sapUiSmallMarginEnd");

            this.#oLegendBox.addItem(oRedDot);
            this.#oLegendBox.addItem(oRedLabel);
            this.#oLegendBox.addItem(oGreenDot);
            this.#oLegendBox.addItem(oGreenLabel);

            // Count summary
            const iOpen = this.#aMarkings.filter(m => m.state !== "CLOSED").length;
            const iClosed = this.#aMarkings.filter(m => m.state === "CLOSED").length;
            const oCount = new Text({
                text: "(" + iOpen + " offen, " + iClosed + " geschlossen)"
            }).addStyleClass("sapUiSmallMarginBegin");
            this.#oLegendBox.addItem(oCount);
        }

        // ── Canvas click → close NC dialog ───────────────────────────────

        #onCanvasClick(oEvent) {
            if (!this.#oCanvas) return;

            const oRect = this.#oCanvas.getBoundingClientRect();
            const fCx = (oEvent.clientX - oRect.left) / oRect.width  * this.#oCanvas.width;
            const fCy = (oEvent.clientY - oRect.top)  / oRect.height * this.#oCanvas.height;
            const fX = ((fCx - this.#fPanX) / this.#fZoom) / this.#oCanvas.width;
            const fY = ((fCy - this.#fPanY) / this.#fZoom) / this.#oCanvas.height;

            // Find clicked marking
            const oClicked = this.#getFilteredMarkings().find(m =>
                Math.sqrt(Math.pow(m.x - fX, 2) + Math.pow(m.y - fY, 2)) < 0.04
            );

            if (!oClicked) return;

            if (oClicked.state === "CLOSED") {
                this.#showOpenDialog(oClicked);
            } else {
                this.#showCloseDialog(oClicked);
            }
        }

        // ── Close NC Dialog ───────────────────────────────────────────────

        #showCloseDialog(oMark) {
            const oCommentInput = new TextArea({
                placeholder: "Kommentar (optional)",
                width: "100%",
                rows: 3
            });

            const oDialog = new Dialog({
                title: "NC schließen: " + oMark.ncCode,
                content: [
                    new FlexBox({
                        direction: "Column",
                        items: [
                            new Label({ text: "Möchten Sie diesen NC als erledigt markieren?" }).addStyleClass("sapUiSmallMarginBottom"),
                            ...(oMark.comment ? [
                                new Label({ text: "Erfasster Kommentar:" }),
                                new Text({ text: oMark.comment }).addStyleClass("sapUiSmallMarginBottom")
                            ] : []),
                            new Label({ text: "Abschluss-Kommentar (optional):" }),
                            oCommentInput
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: "NC schließen",
                    type: "Emphasized",
                    press: async () => {
                        oDialog.setBusy(true);
                        await this.#closeNc(oMark, oCommentInput.getValue());
                        oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Abbrechen",
                    press: () => oDialog.close()
                }),
                afterClose: () => oDialog.destroy()
            });

            oDialog.open();
        }

        // ── Open NC Dialog ────────────────────────────────────────────────

        #showOpenDialog(oMark) {
            const oCommentInput = new TextArea({
                placeholder: "Kommentar (optional)",
                width: "100%",
                rows: 3
            });

            const oDialog = new Dialog({
                title: "NC öffnen: " + oMark.ncCode,
                content: [
                    new FlexBox({
                        direction: "Column",
                        items: [
                            new Label({ text: "Möchten Sie diesen NC wieder öffnen?" }).addStyleClass("sapUiSmallMarginBottom"),
                            ...(oMark.comment ? [
                                new Label({ text: "Erfasster Kommentar:" }),
                                new Text({ text: oMark.comment }).addStyleClass("sapUiSmallMarginBottom")
                            ] : []),
                            new Label({ text: "Kommentar (optional):" }),
                            oCommentInput
                        ]
                    }).addStyleClass("sapUiSmallMargin")
                ],
                beginButton: new Button({
                    text: "NC öffnen",
                    type: "Emphasized",
                    press: async () => {
                        oDialog.setBusy(true);
                        await this.#openNc(oMark, oCommentInput.getValue());
                        oDialog.close();
                    }
                }),
                endButton: new Button({
                    text: "Abbrechen",
                    press: () => oDialog.close()
                }),
                afterClose: () => oDialog.destroy()
            });

            oDialog.open();
        }

        // ── Close NC API Call ─────────────────────────────────────────────

        async #closeNc(oMark, sComment) {
            try {
                const sCurrentPath = window.location.pathname;
                const oPathMatch = sCurrentPath.match(/\/sapdmdmepod2\/~([^~]+)~/);
                const sSessionId = oPathMatch ? oPathMatch[1] : null;

                const sUrl = sSessionId
                    ? "/sapdmdmepod2/~" + sSessionId + "~/dme/nonconformance-ms/api/nonconformance/v1/close"
                    : "/nonconformance/v1/close";

                // Get CSRF token
                let sCsrfToken = "";
                try {
                    const oTokenResp = await fetch(sUrl, {
                        method: "GET",
                        headers: { "X-Csrf-Token": "Fetch" },
                        credentials: "include"
                    });
                    sCsrfToken = oTokenResp.headers.get("X-Csrf-Token") || "";
                } catch (e) { /* skip */ }

                const oBody = {
                    id: oMark.id,
                    plant: oMark.plant,
                    ...(sComment ? { comments: sComment } : {})
                };

                const oResponse = await fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-Dme-Plant": oMark.plant,
                        "X-Dme-Industry-Type": "DISCRETE",
                        ...(sCsrfToken ? { "X-Csrf-Token": sCsrfToken } : {})
                    },
                    credentials: "include",
                    body: JSON.stringify(oBody)
                });

                if (oResponse.ok) {
                    this.#showMessage("NC erfolgreich geschlossen.", "Success");
                    await this.#loadFromApi();
                    this.#refreshNcDataTree();
                } else {
                    const sErr = await oResponse.text().catch(() => oResponse.status);
                    this.#showMessage("Fehler beim Schließen: " + sErr, "Error");
                }

            } catch (oErr) {
                this.#showMessage("Fehler: " + oErr.message, "Error");
                console.error("[NcReworkWidget]", oErr);
            }
        }

        // ── Open NC API Call ─────────────────────────────────────────────

        async #openNc(oMark, sComment) {
            try {
                const sCurrentPath = window.location.pathname;
                const oPathMatch = sCurrentPath.match(/\/sapdmdmepod2\/~([^~]+)~/);
                const sSessionId = oPathMatch ? oPathMatch[1] : null;

                const sUrl = sSessionId
                    ? "/sapdmdmepod2/~" + sSessionId + "~/dme/nonconformance-ms/api/nonconformance/v1/open"
                    : "/nonconformance/v1/open";

                // Get CSRF token
                let sCsrfToken = "";
                try {
                    const oTokenResp = await fetch(sUrl, {
                        method: "GET",
                        headers: { "X-Csrf-Token": "Fetch" },
                        credentials: "include"
                    });
                    sCsrfToken = oTokenResp.headers.get("X-Csrf-Token") || "";
                } catch (e) { /* skip */ }

                const oBody = {
                    id: oMark.id,
                    plant: oMark.plant,
                    ...(sComment ? { comments: sComment } : {})
                };

                const oResponse = await fetch(sUrl, {
                    method: "POST",
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "X-Dme-Plant": oMark.plant,
                        "X-Dme-Industry-Type": "DISCRETE",
                        ...(sCsrfToken ? { "X-Csrf-Token": sCsrfToken } : {})
                    },
                    credentials: "include",
                    body: JSON.stringify(oBody)
                });

                if (oResponse.ok) {
                    this.#showMessage("NC erfolgreich geöffnet.", "Success");
                    await this.#loadFromApi();
                    this.#refreshNcDataTree();
                } else {
                    const sErr = await oResponse.text().catch(() => oResponse.status);
                    this.#showMessage("Fehler beim Öffnen: " + sErr, "Error");
                }

            } catch (oErr) {
                this.#showMessage("Fehler: " + oErr.message, "Error");
                console.error("[NcReworkWidget]", oErr);
            }
        }

        // ── Refresh NC Data Tree ─────────────────────────────────────────

        #refreshNcDataTree() {
            try {
                // Zuverlässigste Methode: SFC-Selektion kurz zurücksetzen und neu setzen.
                // Der NC Data Tree subscribed auf /workList/selected und lädt bei Änderung neu.
                const aSelected = PodContext.get("/workList/selected");
                const sSfc = PodContext.get("/workList/selected/0/sfc");

                if (!sSfc) {
                    console.warn("[NcReworkWidget] Kein SFC selektiert – Tree-Refresh übersprungen.");
                    return;
                }

                // Kurz leeren → Tree erkennt Änderung und leert sich
                PodContext.set("/workList/selected", []);

                // Im nächsten Tick wieder befüllen → Tree lädt neu
                setTimeout(() => {
                    PodContext.set("/workList/selected", aSelected || [{ sfc: sSfc }]);
                    console.info("[NcReworkWidget] NC Data Tree refresh ausgelöst für SFC:", sSfc);
                }, 50);

            } catch (e) {
                console.warn("[NcReworkWidget] Tree-Refresh fehlgeschlagen:", e.message);
            }
        }

        // ── Draw ──────────────────────────────────────────────────────────

        #drawCanvas(oImg) {
            if (!this.#oCanvas) return;
            const oCtx = this.#oCanvas.getContext("2d");
            const iW = this.#oCanvas.width;
            const iH = this.#oCanvas.height;

            oCtx.clearRect(0, 0, iW, iH);
            oCtx.save();
            oCtx.translate(this.#fPanX, this.#fPanY);
            oCtx.scale(this.#fZoom, this.#fZoom);
            if (oImg) oCtx.drawImage(oImg, 0, 0, iW, iH);

            // Marker-Größe relativ zur Canvas-Breite (min 12, max 40)
            const iR = Math.round(Math.max(12, Math.min(40, iW * 0.022)));
            const iRing = Math.round(iR * 2);
            const iFontSize = Math.round(iR * 0.85);
            const iLabelFont = Math.round(iR * 0.95);

            this.#getFilteredMarkings().forEach((oMark, i) => {
                const iX = Math.round(oMark.x * iW);
                const iY = Math.round(oMark.y * iH);
                const sColor = oMark.state === "CLOSED" ? "#2E8B57" : "#DC3232";
                const sRing = oMark.state === "CLOSED" ? "rgba(46,139,87,0.25)" : "rgba(220,50,50,0.25)";

                oCtx.beginPath();
                oCtx.arc(iX, iY, iRing, 0, 2 * Math.PI);
                oCtx.fillStyle = sRing;
                oCtx.fill();

                oCtx.beginPath();
                oCtx.arc(iX, iY, iR, 0, 2 * Math.PI);
                oCtx.fillStyle = sColor;
                oCtx.strokeStyle = "#fff";
                oCtx.lineWidth = Math.max(2, iR * 0.2);
                oCtx.fill();
                oCtx.stroke();

                oCtx.fillStyle = "#fff";
                oCtx.font = "bold " + iFontSize + "px Arial";
                oCtx.textAlign = "center";
                oCtx.textBaseline = "middle";
                oCtx.fillText(String(i + 1), iX, iY);

                const sText = oMark.ncCode;
                oCtx.font = "bold " + iLabelFont + "px Arial";
                const iTextW = oCtx.measureText(sText).width + 10;
                const iLX = iX + iR + 4;
                const iLY = iY - Math.round(iR * 0.6);
                const iLH = Math.round(iLabelFont * 1.6);

                oCtx.fillStyle = "rgba(30,30,30,0.8)";
                oCtx.beginPath();
                oCtx.roundRect
                    ? oCtx.roundRect(iLX, iLY - iLH / 2, iTextW, iLH, 4)
                    : oCtx.rect(iLX, iLY - iLH / 2, iTextW, iLH);
                oCtx.fill();

                oCtx.fillStyle = "#fff";
                oCtx.textAlign = "left";
                oCtx.fillText(sText, iLX + 5, iLY);
            });
            oCtx.restore();
        }

        // ── Tooltip ───────────────────────────────────────────────────────

        #onMouseMove(oEvent) {
            if (!this.#oCanvas) return;
            // Pan wenn Drag aktiv
            if (this.#bDragging && this.#oDragStart) {
                this.#fPanX = oEvent.clientX - this.#oDragStart.x;
                this.#fPanY = oEvent.clientY - this.#oDragStart.y;
                this.#clampPan();
                this.#drawCanvas(this._platineImg);
                return;
            }
            if (!this.#aMarkings.length) return;
            const oRect = this.#oCanvas.getBoundingClientRect();
            const fCx = (oEvent.clientX - oRect.left) / oRect.width  * this.#oCanvas.width;
            const fCy = (oEvent.clientY - oRect.top)  / oRect.height * this.#oCanvas.height;
            const fX = ((fCx - this.#fPanX) / this.#fZoom) / this.#oCanvas.width;
            const fY = ((fCy - this.#fPanY) / this.#fZoom) / this.#oCanvas.height;

            const oTip = document.getElementById(this.#sCanvasId + "-tooltip");
            if (!oTip) return;

            const oHovered = this.#getFilteredMarkings().find(m =>
                Math.sqrt(Math.pow(m.x - fX, 2) + Math.pow(m.y - fY, 2)) < 0.04
            );

            if (oHovered) {
                const sColor = oHovered.state !== "CLOSED" ? "#DC3232" : "#2E8B57";
                const sStatusLabel = oHovered.state !== "CLOSED" ? "Offen" : "Geschlossen";
                const sComment = oHovered.comment
                    ? "<div style='margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.3);'>" +
                      "<span style='color:#ccc; font-size:11px;'>Kommentar</span><br>" +
                      oHovered.comment + "</div>"
                    : "";
                const sAction = oHovered.state !== "CLOSED"
                    ? "<div style='margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.3); color:#aef; font-size:11px;'>" +
                      "&#8594; Klicken zum Schließen</div>"
                    : "<div style='margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.3); color:#afa; font-size:11px;'>" +
                      "&#8594; Klicken zum Öffnen</div>";
                oTip.innerHTML =
                    "<div style='display:flex; justify-content:space-between; align-items:center; gap:12px;'>" +
                    "<strong style='font-size:14px;'>" + oHovered.ncCode + "</strong>" +
                    "<span style='background:" + sColor + "; padding:2px 8px; border-radius:10px; font-size:11px;'>" + sStatusLabel + "</span>" +
                    "</div>" +
                    sComment +
                    sAction;
                oTip.style.display = "block";
                oTip.style.left = (oEvent.clientX - oRect.left + 12) + "px";
                oTip.style.top = (oEvent.clientY - oRect.top - 40) + "px";
            } else {
                oTip.style.display = "none";
            }
        }

        // ── Helpers ───────────────────────────────────────────────────────

        #getFilteredMarkings() {
            if (this.#sFilter === "OPEN")   return this.#aMarkings.filter(m => m.state !== "CLOSED");
            if (this.#sFilter === "CLOSED") return this.#aMarkings.filter(m => m.state === "CLOSED");
            return this.#aMarkings;
        }

        #extractPlant(vPlant) {
            if (!vPlant) return null;
            if (typeof vPlant === "object") return vPlant.plant || vPlant.code || null;
            const sStr = String(vPlant);
            const oMatch = sStr.match(/^plant[=:]\s*([^,\s]+)/i);
            if (oMatch) return oMatch[1];
            if (!sStr.includes("=") && !sStr.includes(",")) return sStr.trim();
            return null;
        }

        #showMessage(sText, sType) {
            if (!this.#oMessageStrip) return;
            this.#oMessageStrip.setText(sText);
            this.#oMessageStrip.setType(sType || "Information");
            this.#oMessageStrip.setVisible(true);
        }
    }

    return NcReworkWidget;
});
