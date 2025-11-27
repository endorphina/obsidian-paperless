class DocumentSelectorModal extends Modal {
	editor: Editor;
	settings: PluginSettings;
	page: number;
	searchQuery: string = ''; // Suchstring-Speicher
	contentContainer: HTMLElement; // Container für dynamisch geladenen Content

	constructor(app: App, editor: Editor, settings: PluginSettings) {
		super(app);
		this.editor = editor;
		this.settings = settings;
		this.page = 0;
	}

	async displayThumbnail(imgElement: HTMLImageElement, documentId: string) {
		const thumbUrl = this.settings.paperlessUrl + '/api/documents/' + documentId + '/thumb/';
		const result = await requestUrl({
			url: thumbUrl.toString(),
			headers: {
				'Authorization': 'token ' + this.settings.paperlessAuthToken
			}
		})	
		imgElement.src = URL.createObjectURL(new Blob([result.arrayBuffer]));
	}

	async displayTags(tagDiv: HTMLDivElement, documentId: string) {
		const thumbUrl = this.settings.paperlessUrl + '/api/documents/' + documentId + '/';
		const result = await requestUrl({
			url: thumbUrl.toString(),
			headers: {
				'Authorization': 'token ' + this.settings.paperlessAuthToken
			}
		})
		const tags = result.json['tags']
		for (let x = 0; x < tags.length; x++) {
			const currentTag = tagDiv.createDiv();
			const tagData = tagCache.get(tags[x]);					
			const tagStr = currentTag.createEl('span', {text: tagData['name']});
			tagStr.setCssStyles({color: tagData['text_color'], fontSize: '0.7em'});
			currentTag.setCssStyles({background: tagData['color'], borderRadius: '8px', padding: '2px', marginTop: '1px', marginRight: '5px'})
		}
	}

	// Neue Funktion: Suche in Paperless durchführen
	async searchPaperlessDocuments(query: string): Promise<string[]> {
		if (!query || query.trim() === '') {
			// Keine Suche: Alle Dokumente zurückgeben
			return cachedResult.json['all'].sort((a:string, b:string) => {return +a - +b}).reverse();
		}

		// API-Call mit query-Parameter
		const url = new URL(this.settings.paperlessUrl + '/api/documents/?query=' + encodeURIComponent(query));
		try {
			const result = await requestUrl({
				url: url.toString(),
				headers: {
					'Authorization': 'token ' + this.settings.paperlessAuthToken
				}
			});

			if (result.status === 200 && result.json['results']) {
				// Extrahiere IDs aus den Suchergebnissen
				return result.json['results'].map((doc: any) => doc.id.toString());
			}
		} catch (exception) {
			new Notice('Fehler bei der Suche: ' + exception);
			console.error('Search error:', exception);
		}

		return [];
	}

	// Neue Funktion: Dokumenten-Grid neu laden
	async refreshDocumentDisplay() {
		// Leere den Content-Container
		this.contentContainer.empty();

		const documentDiv = this.contentContainer.createDiv({cls: 'obsidian-paperless-row'});
		const left = documentDiv.createDiv({cls: 'obsidian-paperless-column'});
		const right = documentDiv.createDiv({cls: 'obsidian-paperless-column'});
		const bottomDiv = this.contentContainer.createDiv();

		// Hole gefilterte Dokument-IDs basierend auf Suchquery
		const availableDocumentIds = await this.searchPaperlessDocuments(this.searchQuery);
		
		this.page = 0; // Reset Pagination

		let observer = new IntersectionObserver(() => {
			const startIndex = this.page;
			let endIndex = this.page + 16;
			if (endIndex > availableDocumentIds.length) {
				endIndex = availableDocumentIds.length;
			}
			this.page = endIndex;
			
			for (let i = startIndex; i < endIndex; i++) {
				const documentId = availableDocumentIds[i];
				const overallDiv = ( i & 1 ) ? right.createDiv({cls: 'obsidian-paperless-overallDiv'}) : left.createDiv({cls: 'obsidian-paperless-overallDiv'});
				const imageDiv = overallDiv.createDiv({cls: 'obsidian-paperless-imageDiv'});
				const tagDiv = overallDiv.createDiv({cls: 'obsidian-paperless-tagDiv'});
				this.displayTags(tagDiv, documentId);
				const imgElement = imageDiv.createEl('img');
				imgElement.width = 260;
				imgElement.onclick = () => {
					const cursor = this.editor.getCursor();
					const line = this.editor.getLine(cursor.line);				
					const documentInfo: PaperlessInsertionData = {
						documentId: documentId,
						range: { 
							from: { line: cursor.line, ch: cursor.ch },
							to: { line: cursor.line, ch: cursor.ch }
						}
					}
					createDocument(this.editor, this.settings, documentInfo);
					overallDiv.setCssStyles({opacity: '0.5'})
				}
				this.displayThumbnail(imgElement, documentId);
			}
		}, {threshold: [0.1]});
		observer.observe(bottomDiv);
	}

	async onOpen() {
		const {contentEl} = this;
		if (cachedResult == null) {
			await refreshCacheFromPaperless(this.settings);
		}

		// Erstelle Suchfeld am Anfang des Modals
		const searchContainer = contentEl.createDiv({cls: 'obsidian-paperless-search'});
		searchContainer.setCssStyles({
			marginBottom: '15px',
			padding: '10px'
		});

		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Dokumente durchsuchen...'
		});
		searchInput.setCssStyles({
			width: '100%',
			padding: '8px',
			fontSize: '14px',
			border: '1px solid var(--background-modifier-border)',
			borderRadius: '4px'
		});

		// Debounced Search: Warte 300ms nach letzter Eingabe
		let searchTimeout: NodeJS.Timeout;
		searchInput.addEventListener('input', (event) => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(async () => {
				this.searchQuery = (event.target as HTMLInputElement).value;
				await this.refreshDocumentDisplay();
			}, 300);
		});

		// Container für Dokumenten-Grid
		this.contentContainer = contentEl.createDiv();

		// Initiale Anzeige aller Dokumente
		await this.refreshDocumentDisplay();
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}
