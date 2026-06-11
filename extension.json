sap.ui.define([
    "sap/dm/dme/pod2/widget/Widget",
    "sap/dm/dme/pod2/widget/metadata/WidgetProperty",
    "sap/dm/dme/pod2/propertyeditor/StringPropertyEditor",
    "sap/dm/dme/pod2/propertyeditor/PropertyCategory",
    "sap/dm/dme/pod2/context/PodContext",
    "sap/m/Button",
    "sap/m/FlexBox",
    "sap/m/Label",
    "sap/m/MessageStrip",
    "sap/m/Panel",
    "sap/m/Select",
    "sap/m/Title",
    "sap/m/Toolbar",
    "sap/m/ToolbarSpacer",
    "sap/ui/core/Item",
    "sap/m/TextArea",
    "sap/ui/core/HTML"
], (
    Widget,
    WidgetProperty,
    StringPropertyEditor,
    PropertyCategory,
    PodContext,
    Button,
    FlexBox,
    Label,
    MessageStrip,
    Panel,
    Select,
    Title,
    Toolbar,
    ToolbarSpacer,
    Item,
    TextArea,
    HTML
) => {
    "use strict";

    const NC_MARKINGS_PATH  = "/custom/ncMarkings";
    const COMPONENT_PATH    = "/custom/selectedComponent";

    class NcMarkingWidget extends Widget {

        #oNcSelect = null;
        #oCompSelect = null;
        #oCommentInput = null;
        #oMessageStrip = null;
        #oCanvas = null;
        #oHtml = null;
        #aMarkings = [];
        #aClickableNcCodes = [];
        #bClickMode = false;
        #sCanvasId = null;
        #sCurrentNcCode = null;
        #oPlatineImg = null;
        // Zoom & Pan
        #fZoom = 1;
        #fPanX = 0;
        #fPanY = 0;
        #bDragging = false;
        #oDragStart = null;

        static getDisplayName() {
            return "NC Markierung auf Platine";
        }

        static getDescription() {
            return "Werker wählt NC Code aus und markiert Fehlerposition auf der Platine.";
        }

        static getIcon() {
            return "sap-icon://quality-issue";
        }

        static getCategory() {
            return "Custom Widgets";
        }

        static getDefaultConfig() {
            return {
                properties: {
                    ncCodes: "",
                    clickableNcCodes: "",
                    komponenten: ""
                }
            };
        }

        getProperties() {
            return [
                new WidgetProperty({
                    displayName: "NC Codes",
                    description: "Kommagetrennte Liste aller NC Codes im Dropdown. Beispiel: SCRATCH,CRACK,DENT,MISSING_PART",
                    category: PropertyCategory.Main,
                    propertyEditor: new StringPropertyEditor(this, "ncCodes")
                }),
                new WidgetProperty({
                    displayName: "Klickbare NC Codes",
                    description: "Kommagetrennte Liste der NC Codes die eine Positionsmarkierung erlauben. Beispiel: SCRATCH,CRACK",
                    category: PropertyCategory.Main,
                    propertyEditor: new StringPropertyEditor(this, "clickableNcCodes")
                }),
                new WidgetProperty({
                    displayName: "Komponenten",
                    description: "Pipe-getrennte Liste: Name=URL|Name2=URL2. Beispiel: Platine A=https://img.example.com/a.png|Platine B=https://img.example.com/b.png",
                    category: PropertyCategory.Main,
                    propertyEditor: new StringPropertyEditor(this, "komponenten")
                })
            ];
        }

        _createView() {
            this.#sCanvasId = this.getId() + "-canvas";
            this.#aClickableNcCodes = this.#parseCodes("clickableNcCodes");

            // ── Komponenten-Dropdown ──────────────────────────────────────
            this.#oCompSelect = new Select({
                width: "220px",
                forceSelection: false,
                change: this.#onComponentChanged.bind(this)
            });
            this.#buildComponentDropdown();

            // ── NC Code Dropdown ──────────────────────────────────────────
            this.#oNcSelect = new Select({
                width: "220px",
                forceSelection: false,
                change: this.#onNcCodeChanged.bind(this)
            });
            this.#buildNcDropdown();

            // ── Comment input ─────────────────────────────────────────────
            this.#oCommentInput = new TextArea({
                placeholder: "Kommentar zur Markierung (optional)...",
                width: "100%",
                rows: 2
            });

            const oCommentRow = new FlexBox({
                direction: "Column",
                items: [
                    new Label({ text: "Kommentar" }),
                    this.#oCommentInput
                ]
            }).addStyleClass("sapUiSmallMargin");

            const oNcRow = new FlexBox({
                alignItems: "Center",
                wrap: "Wrap",
                items: [
                    new FlexBox({
                        direction: "Column",
                        items: [
                            new Label({ text: "Komponente" }),
                            this.#oCompSelect
                        ]
                    }).addStyleClass("sapUiSmallMarginEnd"),
                    new FlexBox({
                        direction: "Column",
                        items: [
                            new Label({ text: "NC Code" }),
                            this.#oNcSelect
                        ]
                    }).addStyleClass("sapUiSmallMarginEnd")
                ]
            }).addStyleClass("sapUiSmallMargin");

            // ── Message Strip ─────────────────────────────────────────────
            this.#oMessageStrip = new MessageStrip({
                visible: true,
                showCloseButton: false,
                type: "Information",
                text: "Bitte Komponente und NC Code auswählen."
            }).addStyleClass("sapUiSmallMarginBeginEnd");

            // ── Toolbar ───────────────────────────────────────────────────
            const oToolbar = new Toolbar({
                content: [
                    new Title({ text: "NC Markierung" }),
                    new ToolbarSpacer(),
                    new Button({
                        text: "Rückgängig",
                        icon: "sap-icon://undo",
                        press: this.#onUndo.bind(this)
                    }),
                    new Button({
                        text: "Alle löschen",
                        icon: "sap-icon://delete",
                        press: this.#onClear.bind(this)
                    }),
                    new Button({
                        text: "Speichern",
                        type: "Emphasized",
                        icon: "sap-icon://save",
                        press: this.#onSave.bind(this)
                    })
                ]
            });

            // ── Canvas ────────────────────────────────────────────────────
            const sHtml =
                '<div style="position:relative; display:inline-block; margin:8px 16px; width:calc(100% - 32px);">' +
                '<canvas id="' + this.#sCanvasId + '" width="800" height="516" ' +
                'style="border:2px solid #ccc; border-radius:4px; width:100%; cursor:default;">' +
                '</canvas>' +
                '<div id="' + this.#sCanvasId + '-hint" ' +
                'style="position:absolute; bottom:12px; left:12px; background:rgba(0,0,0,0.65); ' +
                'color:#fff; padding:5px 10px; border-radius:4px; font-size:13px; display:none;">' +
                'Fehlerposition anklicken' +
                '</div>' +
                '</div>';

            this.#oHtml = new HTML({
                content: sHtml,
                afterRendering: this.#onAfterRendering.bind(this)
            });

            return new Panel(this.getId(), {
                headerToolbar: oToolbar,
                content: [oNcRow, oCommentRow, this.#oMessageStrip, this.#oHtml]
            });
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

        #buildComponentDropdown() {
            this.#oCompSelect.removeAllItems();
            this.#oCompSelect.addItem(new Item({ key: "", text: "– Komponente wählen –" }));
            this.#parseKomponenten().forEach(o => {
                this.#oCompSelect.addItem(new Item({ key: o.url, text: o.label }));
            });
        }

        #buildNcDropdown() {
            this.#oNcSelect.removeAllItems();
            this.#oNcSelect.addItem(new Item({ key: "", text: "– NC Code wählen –" }));
            this.#parseCodes("ncCodes").forEach(sCode => {
                this.#oNcSelect.addItem(new Item({ key: sCode, text: sCode }));
            });
        }

        // ── Komponente gewählt ────────────────────────────────────────────

        #onComponentChanged() {
            const sUrl = this.#oCompSelect.getSelectedKey();
            if (!sUrl) return;
            const sLabel = this.#oCompSelect.getSelectedItem()
                ? this.#oCompSelect.getSelectedItem().getText() : "";

            // Markierungen zurücksetzen wenn Komponente wechselt
            this.#aMarkings = [];
            PodContext.set(NC_MARKINGS_PATH, []);

            // Im POD Context speichern damit NcReworkWidget mitbekommt
            PodContext.set(COMPONENT_PATH, { url: sUrl, label: sLabel });

            this.#loadImage(sUrl);
            this.#showMessage('Komponente "' + sLabel + '" geladen. Bitte NC Code auswählen.', "Information");
        }

        // ── NC Code selected ──────────────────────────────────────────────

        #onNcCodeChanged() {
            const sKey = this.#oNcSelect.getSelectedKey();
            this.#sCurrentNcCode = sKey || null;
            this.#aClickableNcCodes = this.#parseCodes("clickableNcCodes");

            const bClickable = !!sKey && this.#aClickableNcCodes.includes(sKey.toUpperCase());
            this.#bClickMode = bClickable;

            if (this.#oCanvas) {
                this.#oCanvas.style.cursor = bClickable ? "crosshair" : (this.#oPlatineImg ? "grab" : "default");
            }

            const oHint = document.getElementById(this.#sCanvasId + "-hint");
            if (oHint) oHint.style.display = bClickable ? "block" : "none";

            if (!sKey) {
                this.#showMessage("Bitte NC Code auswählen.", "Information");
            } else if (!this.#oCompSelect.getSelectedKey()) {
                this.#showMessage("Bitte zuerst eine Komponente auswählen.", "Warning");
            } else if (bClickable) {
                this.#showMessage(
                    'NC Code "' + sKey + '" – Fehlerposition auf der Platine anklicken.',
                    "Success"
                );
            } else {
                this.#showMessage(
                    'NC Code "' + sKey + '" erfordert keine Positionsmarkierung.',
                    "Warning"
                );
            }
        }

        // ── After rendering ───────────────────────────────────────────────

        #onAfterRendering() {
            const oNewCanvas = document.getElementById(this.#sCanvasId);
            if (!oNewCanvas) return;

            // Listener nur registrieren wenn neues Canvas-Element (verhindert Doppelregistrierung)
            if (oNewCanvas !== this.#oCanvas) {
                this.#oCanvas = oNewCanvas;
                this.#oCanvas.addEventListener("click",      this.#onCanvasClick.bind(this));
                this.#oCanvas.addEventListener("wheel",      this.#onWheel.bind(this),      { passive: false });
                this.#oCanvas.addEventListener("mousedown",  this.#onMouseDown.bind(this));
                this.#oCanvas.addEventListener("mousemove",  this.#onMouseMove.bind(this));
                this.#oCanvas.addEventListener("mouseup",    this.#onMouseUp.bind(this));
                this.#oCanvas.addEventListener("mouseleave", this.#onMouseUp.bind(this));
                this.#oCanvas.addEventListener("dblclick",   this.#onDblClick.bind(this));
            }

            // Platzhalter zeigen
            this.#drawCanvas(null);

            // Erste konfigurierte Komponente automatisch laden falls keine aktiv
            const oActive = PodContext.get(COMPONENT_PATH);
            if (oActive && oActive.url) {
                this.#oCompSelect.setSelectedKey(oActive.url);
                this.#loadImage(oActive.url);
            } else {
                const aKomp = this.#parseKomponenten();
                if (aKomp.length > 0) {
                    this.#oCompSelect.setSelectedKey(aKomp[0].url);
                    PodContext.set(COMPONENT_PATH, { url: aKomp[0].url, label: aKomp[0].label });
                    this.#loadImage(aKomp[0].url);
                }
            }
        }

        // ── Zoom & Pan Events ─────────────────────────────────────────────

        #onWheel(oEvent) {
            oEvent.preventDefault();
            if (!this.#oCanvas) return;
            const oRect = this.#oCanvas.getBoundingClientRect();
            const fMx = (oEvent.clientX - oRect.left) / oRect.width  * this.#oCanvas.width;
            const fMy = (oEvent.clientY - oRect.top)  / oRect.height * this.#oCanvas.height;
            const fDelta = oEvent.deltaY > 0 ? 0.85 : 1.18;
            const fNewZoom = Math.min(10, Math.max(1, this.#fZoom * fDelta));
            // Pan anpassen damit Mausposition stabil bleibt
            this.#fPanX = fMx - (fMx - this.#fPanX) * (fNewZoom / this.#fZoom);
            this.#fPanY = fMy - (fMy - this.#fPanY) * (fNewZoom / this.#fZoom);
            this.#fZoom = fNewZoom;
            this.#clampPan();
            this.#drawCanvas(this.#oPlatineImg);
        }

        #onMouseDown(oEvent) {
            if (this.#bClickMode) return; // Im Markier-Modus kein Pan
            this.#bDragging = true;
            this.#oDragStart = { x: oEvent.clientX - this.#fPanX, y: oEvent.clientY - this.#fPanY };
            this.#oCanvas.style.cursor = "grabbing";
        }

        #onMouseMove(oEvent) {
            if (!this.#bDragging || !this.#oDragStart) return;
            this.#fPanX = oEvent.clientX - this.#oDragStart.x;
            this.#fPanY = oEvent.clientY - this.#oDragStart.y;
            this.#clampPan();
            this.#drawCanvas(this.#oPlatineImg);
        }

        #onMouseUp() {
            if (this.#bDragging) {
                this.#bDragging = false;
                this.#oDragStart = null;
                this.#oCanvas.style.cursor = this.#bClickMode ? "crosshair" : "grab";
            }
        }

        #onDblClick() {
            this.#fZoom = 1;
            this.#fPanX = 0;
            this.#fPanY = 0;
            this.#drawCanvas(this.#oPlatineImg);
        }

        #clampPan() {
            if (!this.#oCanvas) return;
            const iW = this.#oCanvas.width;
            const iH = this.#oCanvas.height;
            const fMaxX = iW * (this.#fZoom - 1);
            const fMaxY = iH * (this.#fZoom - 1);
            this.#fPanX = Math.min(0, Math.max(-fMaxX, this.#fPanX));
            this.#fPanY = Math.min(0, Math.max(-fMaxY, this.#fPanY));
        }

        // ── Bild laden ────────────────────────────────────────────────────

        #loadImage(sUrl) {
            if (!sUrl) {
                this.#showMessage("Bitte eine Komponente auswählen.", "Warning");
                return;
            }
            const oImg = new Image();
            oImg.onload = () => {
                this.#oPlatineImg = oImg;
                if (this.#oCanvas) {
                    this.#oCanvas.width  = oImg.naturalWidth  || 800;
                    this.#oCanvas.height = oImg.naturalHeight || 516;
                }
                this.#fZoom = 1; this.#fPanX = 0; this.#fPanY = 0;
                this.#drawCanvas(oImg);
                if (this.#oCanvas) this.#oCanvas.style.cursor = "grab";
                console.info("[NcMarkingWidget] Bild geladen:", sUrl);
            };
            oImg.onerror = () => {
                this.#showMessage("Bild konnte nicht geladen werden. URL prüfen.", "Error");
            };
            oImg.src = sUrl;
        }

        // ── Canvas click ──────────────────────────────────────────────────

        #onCanvasClick(oEvent) {
            if (!this.#bClickMode || !this.#sCurrentNcCode) return;

            const oRect = this.#oCanvas.getBoundingClientRect();
            // Skalierte Canvas-Koordinaten (CSS-Pixel → Canvas-Pixel)
            const fCx = (oEvent.clientX - oRect.left) / oRect.width  * this.#oCanvas.width;
            const fCy = (oEvent.clientY - oRect.top)  / oRect.height * this.#oCanvas.height;
            // Zoom & Pan rückrechnen → normalisiert [0..1]
            const fX = Math.round(((fCx - this.#fPanX) / this.#fZoom) / this.#oCanvas.width  * 1000) / 1000;
            const fY = Math.round(((fCy - this.#fPanY) / this.#fZoom) / this.#oCanvas.height * 1000) / 1000;

            const sComment = this.#oCommentInput ? this.#oCommentInput.getValue().trim() : "";
            this.#aMarkings.push({ ncCode: this.#sCurrentNcCode, x: fX, y: fY, comment: sComment });
            this.#drawCanvas(this.#oPlatineImg);
            PodContext.set(NC_MARKINGS_PATH, this.#aMarkings);

            if (this.#oCommentInput) {
                this.#oCommentInput.setValue("");
                this.#oCommentInput.fireChange({ value: "" });
            }

            this.#showMessage(
                "Markierung " + this.#aMarkings.length + " gesetzt für: " + this.#sCurrentNcCode,
                "Success"
            );
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

            if (oImg) {
                oCtx.drawImage(oImg, 0, 0, iW, iH);
            } else {
                // Grauer Platzhalter während Bild lädt
                oCtx.fillStyle = "#f0f0f0";
                oCtx.fillRect(0, 0, iW, iH);
                oCtx.fillStyle = "#999";
                oCtx.font = "18px Arial";
                oCtx.textAlign = "center";
                oCtx.textBaseline = "middle";
                oCtx.fillText("Materialbild wird geladen...", iW / 2, iH / 2);
            }

            // Marker-Größe relativ zur Canvas-Breite (min 12, max 40)
            const iR = Math.round(Math.max(12, Math.min(40, iW * 0.022)));
            const iRing = Math.round(iR * 2);
            const iFontSize = Math.round(iR * 0.85);
            const iLabelFont = Math.round(iR * 0.95);

            this.#aMarkings.forEach((oMark, i) => {
                const iX = Math.round(oMark.x * iW);
                const iY = Math.round(oMark.y * iH);

                oCtx.beginPath();
                oCtx.arc(iX, iY, iRing, 0, 2 * Math.PI);
                oCtx.fillStyle = "rgba(220,50,50,0.25)";
                oCtx.fill();

                oCtx.beginPath();
                oCtx.arc(iX, iY, iR, 0, 2 * Math.PI);
                oCtx.fillStyle = "#DC3232";
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

        // ── Undo / Clear / Save ───────────────────────────────────────────

        #onUndo() {
            if (!this.#aMarkings.length) return;
            this.#aMarkings.pop();
            this.#drawCanvas(this.#oPlatineImg);
            PodContext.set(NC_MARKINGS_PATH, this.#aMarkings);
            this.#showMessage("Letzte Markierung entfernt.", "Information");
        }

        #onClear() {
            this.#aMarkings = [];
            this.#drawCanvas(this.#oPlatineImg);
            PodContext.set(NC_MARKINGS_PATH, []);
            this.#showMessage("Alle Markierungen gelöscht.", "Information");
        }

        async #onSave() {
            if (!this.#aMarkings.length) {
                this.#showMessage("Keine Markierungen vorhanden.", "Warning");
                return;
            }

            const vPlant = PodContext.get("/plant")
                || PodContext.get("/podConfig/plant")
                || PodContext.get("/plantConfig/plant");
            const sPlant = this.#extractPlant(vPlant);

            const sSfc = PodContext.get("/workList/selected/0/sfc")
                || PodContext.get("/selectedSfc")
                || PodContext.get("/sfc");

            if (!sPlant || !sSfc) {
                this.#showMessage(
                    "Plant oder SFC nicht gefunden. Plant: " + sPlant + " SFC: " + sSfc,
                    "Error"
                );
                return;
            }

            // Resource, SessionId, URLs und CSRF einmalig vor der Loop ermitteln
            const vResource = PodContext.get("/filter/resources/0/resource")
                || PodContext.get("/workList/selected/0/resource")
                || PodContext.get("/selectedResource")
                || PodContext.get("/resource");
            const sResource = typeof vResource === "object"
                ? (vResource.resource || vResource.code || vResource.name || "")
                : (vResource || "");

            if (!sResource) {
                console.warn("[NcMarkingWidget] Resource nicht gefunden – Speichern abgebrochen.");
                this.#showMessage("Resource nicht gefunden. Bitte Resource in der POD-Filterleiste auswählen.", "Error");
                return;
            }
            console.info("[NcMarkingWidget] Resource:", sResource);

            const sCurrentPath = window.location.pathname;
            const oPathMatch = sCurrentPath.match(/\/sapdmdmepod2\/~([^~]+)~/);
            const sSessionId = oPathMatch ? oPathMatch[1] : null;

            const sApiUrl = sSessionId
                ? "/sapdmdmepod2/~" + sSessionId + "~/dme/nonconformance-ms/api/nonconformance/v1/log"
                : "/nonconformance/v1/log";

            const sCsrfBaseUrl = sSessionId
                ? "/sapdmdmepod2/~" + sSessionId + "~/dme/nonconformance-ms/api/nonconformance/v1/nonconformances?plant=" + encodeURIComponent(sPlant) + "&sfc=" + encodeURIComponent(sSfc)
                : "/nonconformance/v1/nonconformances?plant=" + encodeURIComponent(sPlant) + "&sfc=" + encodeURIComponent(sSfc);

            let sCsrfToken = "";
            try {
                const oTokenResponse = await fetch(sCsrfBaseUrl, {
                    method: "GET",
                    headers: { "X-Csrf-Token": "Fetch" },
                    credentials: "include"
                });
                sCsrfToken = oTokenResponse.headers.get("X-Csrf-Token") || "";
            } catch (e) {
                console.warn("[NcMarkingWidget] CSRF fetch failed:", e);
            }

            const oPostHeaders = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Dme-Plant": sPlant,
                "X-Dme-Industry-Type": "DISCRETE",
                ...(sCsrfToken ? { "X-Csrf-Token": sCsrfToken } : {})
            };

            this.#showMessage("Wird gespeichert...", "Information");

            let iSuccess = 0;
            let iError = 0;

            for (const oMark of this.#aMarkings) {
                try {
                    const oComp = PodContext.get(COMPONENT_PATH);
                    const sCompUrl   = (oComp && oComp.url)   ? oComp.url   : "";
                    const sCompLabel = (oComp && oComp.label) ? oComp.label : "";

                    const aDataFields = [
                        { key: "POSITION_X",    value: String(oMark.x) },
                        { key: "POSITION_Y",    value: String(oMark.y) },
                        { key: "COMPONENT_URL_1", value: sCompUrl },
                        { key: "COMPONENT_1",     value: sCompLabel }
                    ];
                    if (oMark.comment) {
                        aDataFields.push({ key: "COMMENT", value: oMark.comment });
                    }

                    const oBody = {
                        plant: sPlant,
                        sfcs: [sSfc],
                        code: oMark.ncCode,
                        resource: sResource,
                        dataFields: aDataFields
                    };

                    const oResponse = await fetch(sApiUrl, {
                        method: "POST",
                        headers: oPostHeaders,
                        credentials: "include",
                        body: JSON.stringify(oBody)
                    });

                    if (oResponse.ok) {
                        iSuccess++;
                    } else {
                        const sErr = await oResponse.text().catch(() => oResponse.status);
                        console.error("[NcMarkingWidget] Error saving NC:", sErr);
                        iError++;
                    }
                } catch (oErr) {
                    console.error("[NcMarkingWidget] Save error:", oErr);
                    iError++;
                }
            }

            PodContext.set(NC_MARKINGS_PATH, this.#aMarkings);

            if (iError === 0) {
                this.#showMessage(iSuccess + " Markierung(en) erfolgreich in SAP gespeichert.", "Success");
            } else {
                this.#showMessage(
                    iSuccess + " gespeichert, " + iError + " Fehler. Bitte Console prüfen.",
                    "Warning"
                );
            }
        }

        onExit() {
            this.#aMarkings = [];
            this.#oPlatineImg = null;
            this.#oCanvas = null;
            PodContext.set(NC_MARKINGS_PATH, []);
            super.onExit && super.onExit();
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

        #parseCodes(sPropKey) {
            return (this.getPropertyValue(sPropKey) || "")
                .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
        }

        #showMessage(sText, sType) {
            if (!this.#oMessageStrip) return;
            this.#oMessageStrip.setText(sText);
            this.#oMessageStrip.setType(sType || "Information");
            this.#oMessageStrip.setVisible(true);
        }
    }

    return NcMarkingWidget;
});
