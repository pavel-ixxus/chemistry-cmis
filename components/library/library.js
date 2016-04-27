/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements. See the NOTICE file distributed with this
 * work for additional information regarding copyright ownership. The ASF
 * licenses this file to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 * 
 * Documents UI component based on the CMIS 1.1 JS Connector
 * 
 * Developer(s): - Ben Chevallereau (ben.chevallereau@armedia.com /
 * benjamin.chevallereau@gmail.com)
 * 
 * Version: 1.0 (06-27-2014)
 * 
 * This JS library can be used to any CMIS 1.1 compliant repository.
 */

;
(function($, window, document, undefined) {

	// Plugin name
	var pluginName = 'cmislibrary';

	// Default options
	var defaults = {
		cmis : {
			// Server URL
			serverUrl : null,
			// Server username
			username : null,
			// Server password
			password : null,
			// Session: can be provided or created by this library (Optional)
			session : null,
			// Object ID of the root folder (Optional)
			initObjectId : null,
			// Path of the root folder (Optional)
			initPath : null,
			// Query to execute at the first loading (Optional)
			initQuery : null,
			// Upload Versioning State
			uploadVersioningState : "major",
			// Upload object type ID
			uploadObjectTypeId : "cmis:document",
			// Search Object Type ID
			searchObjectTypeId : "cmis:document"
		},
		display : {
			property : {},
			type : {
				"datetime" : function(value, data) {
					return new Date(parseInt(value));
				}
			}
		},
		// Maximum number of items per page
		maxItems : 20,
		// Sort options
		sort : {
			field : "cmis:name",
			order : "ASC"
		},
		// Load documents at the first loading
		autoLoad : true,
		// Display only checked out documents
		showOnlyCheckedOutDocs : false,
		// List of types to do not display
		excludingFilter : [],
		// Mime-type with preview implementation
		previewMIMETypes : [],
		// Previewer options
		previewOptions : {},
		// Use messages for the communication between UI components (Optional)
		useMessages : false,
		events : {
			// Function called when the component is initialized
			complete : function(library) {
				// DO NOTHING
			},
			// Function called when a new line is added on the table
			documentAdded : function(library, newItem, data) {
				// DO NOTHING
			}
		}

	};

	// The actual plugin constructor
	function Library(element, options) {
		this.element = element;

		this.options = $.extend(true, {}, defaults, options);

		this._defaults = defaults;
		this._name = pluginName;

		this.init();
	}

	/**
	 * Get the path where JS files are stored
	 */
	Library.prototype._getPath = function() {
		var path = "";
		$("script").each(function() {
			var src = $(this).attr("src");
			if (src) {
				var fileName = src.slice(src.lastIndexOf("/") + 1);
				if (fileName.lastIndexOf("?") != -1)
					fileName = fileName.slice(0, fileName.lastIndexOf("?"));
				if (fileName === "library.js")
					path = src.substring(0, src.lastIndexOf("/"));
			}
		});
		return path;
	}

	/**
	 * Initialisation method.
	 */
	Library.prototype.init = function() {
		var library = this;

		// Register the UI component
		library._register();

		// Check if templates have been loaded or not
		var body = $(this.element).closest("body");
		if (body.find(".cmistemplates").length == 0)
			$(body).append("<div class='cmistemplates'></div)");
		var path = library._getPath();

		// Load dynamically the file templates.html
		body.find(".cmistemplates").load(path + "/template.html", null, function complete(responseText, textStatus, jqXHR) {
			// Load the main component
			$(library.element).html($(".cmistemplates").find("#cmis-library-template").html());

			// Create the header
			var header = $("#cmis-library-header-template").html();
			$(library.element).find(".tableHeader").append($(header));

			// Create the Drag&Drop zone
			jQuery.event.props.push('dataTransfer');
			var ddarea = $(library.element).find("#filedrag");

			// Bind events for the d&d zone
			ddarea.bind('dragenter dragover', false).bind('drop', function(e) {
				e.stopPropagation();
				e.preventDefault();

				// Upload each one of the dropped file
				jQuery.each(e.dataTransfer.files, function(index, file) {
					var refresh = index == e.dataTransfer.files.length - 1;
					library._uploadFile(file.name, file, file.type, refresh);
				});
			});

			// Configure the upload button
			$(".uploadarea .uploadform input").bind('change', function(e) {
				var files = e.target.files;

				// Upload each one of selected fiels
				jQuery.each(files, function(index, file) {
					var refresh = index == files.length - 1;
					library._uploadFile(file.name, file, file.type, refresh);
				});
				$(".uploadarea .uploadform input").val("");
			});

			// Configure the "Add Document" button
			$(library.element).find(".addDocument").click(function() {
				if ($(library.element).find(".uploadarea").css("display") == "table")
					$(library.element).find(".uploadarea").css("display", "block");
				$(library.element).find(".uploadarea").slideToggle(200, function() {
					if ($(library.element).find(".uploadarea").css("display") == "block")
						$(library.element).find(".uploadarea").css("display", "table");
				});
			});

			// Configure the "Search" button
			$(library.element).find("#queryButton").click(function() {
				library._onClickSearch();
			});
			$(library.element).find("#queryValue").keypress(function(event) {
				if (event.which == 13) {
					event.preventDefault();
					library._onClickSearch();
				}
			});
			$(library.element).find("#queryValue").focusin(function(event) {
				$(library.element).find(".query .advanced-search").fadeIn();
			});
			$(library.element).find("#queryValue").focusout(function(event) {
				$(library.element).find(".query .advanced-search").fadeOut();
			});
			$(library.element).find("#queryClean").click(function() {
				// Save the current state
				library.options.search_mode = false;
				// Refresh the list of documents
				var folderId = $(library.element).attr("previousId");
				library._displayChildren(null, folderId);
			});

			// Configure the Advanced search part
			var advancedSearch = $(library.element).find(".query .advanced-search");
			var templates = $(".cmis-library-advanced-search-template");
			if (templates.length == 0)
				$(advancedSearch).remove();
			else {
				$(advancedSearch).append("<div class='title'>Search for...</div>");
				$(templates).each(function(item, form) {
					var title = $(form).attr("title");
					$(advancedSearch).append("<div class='type'>" + title + "</div>");

					$(advancedSearch).find(".type:contains('" + title + "')").click(function() {
						// Configure the click option
						library._onClickAdvancedSearchForm(form);
					});
				});
			}

			// Configure the table header
			$(library.element).find(".cmis-library-header td.sortable").each(function(index, column) {
				// Get the column name
				var columnName = $(column).html();

				// Update the column header
				$(column).html("<div class='header-name'>" + columnName + "</div><div class='sort-icon'></div>");

				// Configure click actions
				$(column).find(".header-name,.sort-icon").click(function() {
					library._onClickSort(this);
				});
			});

			// Attach keypress event on the login form
			$(library.element).find(".login input").keypress(function(e) {
				if (e.which === 13) {
					e.preventDefault();
					$(library.element).find(".login #login").click();
				}
			});

			// Attach the login action
			$(library.element).find(".login #login").click(function() {
				library._onClickLogin();
			});

			// Attach the login action
			$(library.element).find(".action-header .logout").click(function() {
				library._onClickLogout();
			});

			// Call the complete function
			if (library.options.events.complete != null)
				library.options.events.complete(library);

			library._preload();

		});
	};

	/**
	 * Try to preload authentication configuration
	 */
	Library.prototype._preload = function() {
		var library = this;
		var authenticated = false;

		// We check if credentials have been provided
		if (library.options.cmis.username != null && library.options.cmis.username.length > 0 && library.options.cmis.password != null && library.options.cmis.password.length > 0)
			authenticated = true;

		if (!authenticated) {
			// We check if credentials have been stored somewhere
			library._retrieveCredentials(function() {

				if (library.options.cmis.username != null && library.options.cmis.username.length > 0 && library.options.cmis.password != null && library.options.cmis.password.length > 0) {
					// Broadcast message
					library._broadcastMessage("cmis-login", library.options.cmis.username + ":" + library.options.cmis.password);

					// Mark the connection as authenticated
					authenticated = true;
				}

				// Check if credentials are filled
				if (!authenticated) {
					// Display the login popup
					$(library.element).find(".login").fadeIn();
				} else {
					// Display the library
					$(library.element).find(".library").fadeIn();
					// Load the document list
					library._load();
				}

				// Refresh the user actions
				library._refreshUserActions();

			});
		} else {
			// Display the library
			$(library.element).find(".library").fadeIn();
			// Load the document list
			library._load();
		}

	}

	/**
	 * Register the UI component to allow communication between components.
	 */
	Library.prototype._register = function() {
		var library = this;

		// By default, events are registered in jQuery
		var container = $;

		// If the component is stored in an Iframe
		if (top != self) {
			// Create the container object that will be local to this component
			container = new Object();
			// Identify that we'll use messages to communicate
			library.useMessages = true;

			// Define the listener used for messages
			function listener(event) {
				console.log("Received event: " + event.data);
				// Get event information
				var eventData = JSON.parse(event.data);
				if (library.register.cmis.components)
					// For each component
					$(library.register.cmis.components).each(function() {
						// If this component has a subscribe event
						if (this.subscribe[eventData.name])
							// Call the function related to this event
							this.subscribe[eventData.name](eventData.params[0])
					});
			}

			// Register listener to be able to receive messages
			if (window.addEventListener) {
				addEventListener("message", listener, false)
			} else {
				attachEvent("onmessage", listener)
			}
		}

		// Initialize the component
		if (container.cmis == null)
			container.cmis = new Object();

		if (container.cmis.components == null)
			container.cmis.components = new Array();
		// Declare this component
		container.cmis.components.push({
			type : 'library',
			// This component will trigger 3 kinds of event
			events : [ 'cmis-deleteChildren', 'cmis-login', 'cmis-logout' ],
			subscribe : {
				// The browser component will receive 3 kind of events
				"cmis-clickFolder" : function(folderId) {
					if (library.options.cmis.session)
						// Refresh the list of nodes
						library._displayChildren(null, folderId);
				},
				"cmis-createFolder" : function(folderId) {
					if (library.options.cmis.session)
						// Refresh the list of nodes
						library._displayChildren(null, folderId);
				},
				"cmis-deleteFolder" : function(folderId) {
					if (library.options.cmis.session)
						// Refresh the list of nodes
						library._displayChildren(null, folderId);
				},
				"cmis-editFolder" : function(folderId) {
					if (library.options.cmis.session)
						// Refresh the list of nodes
						library._displayChildren(null, folderId);
				},
				"cmis-getCheckedOutDocs" : function() {
					// Get all checked out documents in the repository
					var session = library.options.cmis.session;
					if (session)
						session.getCheckedOutDocs(null, {
							includeAllowableActions : true,
							request : {
								success : function(data) {
									// Display the result of the query
									library._displayQueryResult(data.objects);
								},
								error : function(jqXHR, textStatus, errorThrown) {
									// Display an error
									library._addError("Can't get checked out documents.");
								}
							}
						});
				}
			}
		});

		// Store the container
		library.register = container;
	};

	/**
	 * Function called to upload a file in the repository
	 * 
	 * @fileName: File name used for the storing in the repository.
	 * @file: HTML5 File that will be uploaded
	 * @mimetype: Mimetype of the document to upload
	 * @refresh: Should refresh the document list
	 */
	Library.prototype._uploadFile = function(fileName, file, mimetype, refresh) {
		var library = this;
		var session = library.options.cmis.session;

		// Get the folder ID of the current library
		var folderId = $(library.element).closest(".cmislibrary").attr("id");

		// Create input properties
		var input = {
			"cmis:name" : fileName,
			"cmis:objectTypeId" : library.options.cmis.uploadObjectTypeId
		};

		// Create the document
		session.createDocument(folderId, file, input, mimetype, library.options.cmis.uploadVersioningState, null, null, null, {
			request : {
				success : function(data) {
					if (refresh)
						// Refresh the list of documents
						library._refresh();
				},
				error : function(e) {
					// Display an error
					library._addError("Impossible to upload the file: " + fileName);
				}
			}
		});
	};

	/**
	 * Load the document list component
	 */
	Library.prototype._load = function() {
		var library = this;

		// If the component is correctly cofnigured
		if (null === this.options.cmis.serverUrl || (null == this.options.cmis.username && null == this.options.cmis.password && null == this.options.cmis.token)) {
			this._addError("Please configure the browser before to initialize it.");
		} else {
			// Test if the session already exists
			if (null == this.options.cmis.session) {
				// Initialize the session
				var session = cmis.createSession(this.options.cmis.serverUrl);
				if (null == this.options.cmis.token)
					session.setCredentials(this.options.cmis.username, this.options.cmis.password);
				else
					session.setToken(this.options.cmis.token);
				session.loadRepositories({
					request : {
						success : function(data) {
							// Save the current session
							library.options.cmis.session = session;
							if (library.options.autoLoad)
								// Display the list of docuents
								library._displayDocuments();
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an error
							var msg = "Error during the connexion: ";
							if (null != textStatus)
								msg += textStatus;
							library._addError(msg);
						}
					}
				});
			} else
				// If the session already exists, just display the list of
				// documents
				this._displayDocuments();
		}
	};

	/**
	 * Display the list of documents
	 */
	Library.prototype._displayDocuments = function() {
		var session = this.options.cmis.session;
		var library = this;

		// Refresh the table header
		library._refreshTableHeader();

		// Display the document list
		$(library.element).find(".library div.documentlist").fadeIn();

		// Show only checked-out documents
		if (this.options.showOnlyCheckedOutDocs) {

			// Get all checked out documents in the repository
			session.getCheckedOutDocs(null, {
				includeAllowableActions : true,
				request : {
					success : function(data) {
						// Display the result of the query
						library._displayQueryResult(data.objects);
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error
						library._addError("Can't get checked out documents.");
					}
				}
			});

			// Load by using the query option
		} else if (null != this.options.cmis.initQuery) {

			// Query the repository
			session.query(this.options.cmis.initQuery, false, {
				includeAllowableActions : true,
				request : {
					success : function(data) {
						// Display the result of the query
						library._displayQueryResult(data.results);
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error
						library._addError("Can't execute the query " + this.options.cmis.initQuery + ".");
					}
				}
			});

			// Load by using the path option
		} else if (null != this.options.cmis.initPath) {

			// Get the object related to this path
			session.getObjectByPath(this.options.cmis.initPath, {
				includeAllowableActions : true,
				request : {
					success : function(data) {
						// Display children of this specific folder
						library._displayChildren(null, data.properties["cmis:objectId"].value);
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an erro
						library._addError("Can't get the object " + this.options.cmis.initPath + " in the repository.");
					}
				}
			});

		} else {
			// Define the object ID as the root folder
			var rootFolderId = session.defaultRepository.rootFolderId;

			// Load by using the object ID
			if (null != this.options.cmis.initObjectId)
				rootFolderId = this.options.cmis.initObjectId;

			// Display children of this specific folder
			this._displayChildren(null, rootFolderId);
		}
	};

	/**
	 * Refresh the document list
	 */
	Library.prototype._refresh = function() {
		var library = this;

		// If we are in "search" mode
		if (library.options.search_mode) {
			library._onClickSearch(null, library.options.query);
		} else
			// Display the list of nodes in the current folder used
			library._displayChildren(null, $(this.element).attr("id"));
	}

	/**
	 * Refresh table columns headers
	 * 
	 */
	Library.prototype._refreshTableHeader = function() {
		var library = this;

		// If sort options have been defined
		if (library.options.sort != null) {
			var field = library.options.sort.field;
			var order = library.options.sort.order;

			// If the field is not null
			if (field != null) {
				// Remove sort icon
				$(library.element).find(".cmis-library-header td.cmis-library-cell.sortable .sort-icon").removeClass("sort-descending-icon");
				$(library.element).find(".cmis-library-header td.cmis-library-cell.sortable .sort-icon").removeClass("sort-ascending-icon");

				// Search the column header with the right field
				var fieldEl = $(library.element).find(".cmis-library-header td.cmis-library-cell.sortable[field='" + field + "']");
				// If the column header exists
				if (fieldEl.length > 0) {
					var icon = $(fieldEl).find(".sort-icon");

					if (order == "ASC")
						$(icon).addClass("sort-ascending-icon");
					else if (order == "DESC")
						$(icon).addClass("sort-descending-icon");
				}
			}
		}
	}

	/**
	 * Refresh user actions on the top menu
	 */
	Library.prototype._refreshUserActions = function() {
		var library = this;

		// Display username
		if (typeof library.options.cmis.username !== "undefined" && library.options.cmis.username != null) {
			$(library.element).find(".action-header .welcome .username").html(" " + library.options.cmis.username);
		}
	}

	/**
	 * Show/Hide the upload panel depending of the user permissions
	 */
	Library.prototype._refreshUploadPanel = function() {
		var session = this.options.cmis.session;
		var library = this;
		// Save the folder id on the component
		var folderId = $(library.element).attr("id");

		session.getObject(folderId, "latest", {
			includeAllowableActions : true,
			request : {
				success : function(data) {
					if (data.allowableActions["canCreateDocument"])
						$(library.element).find(".uploadDocument").fadeIn();
					else
						$(library.element).find(".uploadDocument").fadeOut();
				},
				error : function(jqXHR, textStatus, errorThrown) {
					// Display an error message
					library._addError("Can't get the object " + folderId + " in the repository.");
				}
			}
		});
	}

	/**
	 * Display a list of nodes
	 * 
	 * @folderId: ID of the folder that contains nodes
	 * @pageIndex: Index of the page to display
	 */
	Library.prototype._displayChildren = function(pageIndex, folderId) {
		var session = this.options.cmis.session;
		var library = this;

		// Save the folder id on the component
		$(library.element).attr("id", folderId);

		// Hide all panels
		$(library.element).find(".library div.panel").fadeOut();

		// Refresh the upload documents panel
		$(library.element).find(".action-header").fadeIn();
		library._refreshUploadPanel();

		// Refresh the table header
		library._refreshTableHeader();

		// Delete the no document warning
		$(library.element).find(".noDocument").hide();

		// Save the current state
		library.options.search_mode = false;

		// Hide the list of actions
		$(library.element).find(".more-actions-popup").fadeOut();

		if (session) {
			$(library.element).find("#overlay").fadeIn(400, function() {

				// Clean the list of files in the table
				var list = $(library.element).find(".tableBody");
				$(list).empty();

				// Delete the pagination
				$(library.element).find(".pagination").remove();

				// Compute the page index
				if (pageIndex == null || pageIndex == NaN)
					pageIndex = 1;

				// Store the current page
				$(library.element).attr("currentPage", pageIndex);

				// Compute the maximum number of items
				var maxItems = parseInt(library.options.maxItems);
				if (maxItems < 1 || isNaN(maxItems))
					maxItems = 20;

				// Get the order by instruction
				var orderBy = "cmis:baseTypeId DESC,cmis:name";
				if (library.options.sort != null) {
					var field = library.options.sort.field;
					var order = library.options.sort.order;

					if (field != null)
						orderBy = field + " " + order;
				}

				// Get children of the current folder
				session.getChildren(folderId, {
					includeAllowableActions : true,
					skipCount : (pageIndex - 1) * maxItems,
					maxItems : maxItems,
					orderBy : orderBy,
					request : {
						success : function(data) {
							// Clean and hide elements
							$(library.element).find("#queryValue").val("");
							$(library.element).find("#queryClean").hide();

							// If there is no documents
							if (data.objects.length == 0) {
								if ($(library.element).find(".noDocument").length == 0)
									$(list).closest(".documentlist .table").after("<div class='noDocument'>There is no document in this folder");
								else
									$(library.element).find(".noDocument").show();
							} else {
								// For each node
								$(data.objects).each(function(index) {
									// Append a new item in the table
									library._appendItem(list, this.object);
								});
								// Append the pagination block
								library._appendPagination(data.hasMoreItems, data.numItems, "_displayChildren");
							}

							// Display the document list
							$(library.element).find(".library div.documentlist").fadeIn();
							$(library.element).find("#overlay").fadeOut();
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an error message
							library._addError("Can't get the children from the object " + folderId + " in the repository.");
							$(library.element).find(".library div.documentlist").fadeIn();
							$(library.element).find("#overlay").fadeOut();
						}
					}
				});
			});
		}

	};

	/**
	 * Display the result of a query
	 * 
	 * @items: Array of nodes to display
	 */
	Library.prototype._displayQueryResult = function(items) {
		var session = this.options.cmis.session;
		var library = this;

		// Refresh the table header
		library._refreshTableHeader();

		// Delete the no document warning
		$(library.element).find(".noDocument").hide();

		// Save the previous folder Id
		$(library.element).attr("previousId", $(library.element).attr("id"));
		$(library.element).attr("id", null);

		// Hide the addDocument part
		$(library.element).find(".uploadDocument").hide();

		// Show the clean search
		$(library.element).find("#queryClean").show();

		$(library.element).find(".documentlist,.advanced-search-form").fadeOut(400).promise().done(function() {

			// Clean the list of files in the table
			var list = $(library.element).find(".tableBody");
			$(list).empty();

			// If the list is empty
			if (items.length == 0)
				if ($(library.element).find(".noDocument").length == 0)
					$(list).closest(".documentlist .table").after("<div class='noDocument'>There is no document matching this query.");
				else
					$(library.element).find(".noDocument").show();
			else {
				// For each node
				$(items).each(function(index) {
					// Append a new item in the table
					library._appendItem(list, this);
				});
			}

			$(library.element).find(".documentlist").fadeIn();
			$(library.element).find("#overlay").fadeOut();
		});
	};

	/**
	 * Append an item in the document list table.
	 * 
	 * @list: HTML Document List
	 * @data: New item to add to the list
	 */
	Library.prototype._appendItem = function(list, data) {
		var library = this;

		// Check the type
		if (this.options.excludingFilter.indexOf(data.properties["cmis:objectTypeId"].value) == -1) {
			// Generate HTML
			var newItem = library._generateElement(data, $("#cmis-library-row-template"));

			// Append HTMl
			$(list).append(newItem);

			// Attach actions
			library._attachActions(newItem);

			// Call event
			if (library.options.events.documentAdded != null)
				library.options.events.documentAdded(library, newItem, data);
		}
	};

	/**
	 * Append the pagination block to the document list
	 * 
	 * @hasMoreItems: Equals to true if there is more items
	 * @numItems: Number of items displayed
	 */
	Library.prototype._appendPagination = function(hasMoreItems, numItems, func) {
		var library = this;
		// Append the pagination block
		$(library.element).find(".documentlist").append('<div class="pagination"><div class="label">Page(s): </div></div>');

		// Compute the number of items per page
		var maxItems = parseInt(library.options.maxItems);
		if (maxItems < 1 || isNaN(maxItems))
			maxItems = 20;

		// Compute the number of page
		var nbOfPages = Math.ceil(numItems / maxItems);

		// Add each page to the pagination
		for (var i = 1; i <= nbOfPages; i++) {
			$(library.element).find(".documentlist .pagination").append('<div class="page" pageIndex="' + i + '">' + i + '</div>');
		}

		// Add event listener on each page
		$(library.element).find(".documentlist .pagination .page").click(function(e) {
			// Get the page index
			var pageIndex = parseInt($(e.currentTarget).html());
			// Add click event
			library._onPageClick(pageIndex, func);
		});

		// Higlight the currentPage
		var currentPage = $(library.element).attr("currentPage");
		if (currentPage == null)
			currentPage = 1;
		$(library.element).find(".documentlist .pagination .page[pageIndex='" + currentPage + "']").addClass("highlight");
	};

	/**
	 * Event handler when a page in the pagination block is clicked
	 * 
	 * @pageIndex: Index of the page to display
	 */
	Library.prototype._onPageClick = function(pageIndex, func) {
		var library = this;
		// Get the ID of the folder currently used
		var folderId = $(library.element).closest(".cmislibrary").attr("id");
		// Call the right function
		library[func](pageIndex, folderId);
	};

	/**
	 * Event handler when the user click on the column header to sort documents
	 * 
	 * @elem: Elem clicke by the user
	 */
	Library.prototype._onClickSort = function(elem) {
		var library = this;
		var column = $(elem).closest("td.sortable");
		var field = $(column).attr("field");
		var order = null;
		if (library.options.sort != null)
			order = library.options.sort.order;
		if (order == null || order == "ASC")
			order = "DESC";
		else if (order == "DESC")
			order = "ASC";

		// Update the library
		if (library.options.sort == null)
			library.options.sort = new Object();

		// If the sort field doesn't change
		if (library.options.sort.field == field)
			// We just update the sort order
			library.options.sort.order = order;
		else
			// We just update the field order
			library.options.sort.field = field;

		// Refresh the document library
		library._refresh();
	};

	/**
	 * Event handler when the delete icon is clicked
	 * 
	 * @icon: Icon clicked
	 */
	Library.prototype._onClickDeleteDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr.cmis-library-row");

		var objectId;
		// If the user clicked on the icon in the document list
		if (row.length > 0) {
			if ($(row).attr('versionSeriesId').length == 0)
				objectId = $(row).attr('id');
			else
				objectId = $(row).attr('versionSeriesId');
		} else {
			// We clicked on the icon in the detailed view
			objectId = $(icon).closest(".detail-actions").attr('versionSeriesId');
		}

		$(library.element).find("#overlay").fadeIn(400, function() {
			// Delete the object in the repository
			session.deleteObject(objectId, true, {
				request : {
					complete : function(e, textStatus, errorThrown) {
						if (e.status == 200) {

							// Refresh the list of nodes
							library._refresh();

							// Broadcast
							library._broadcastMessage("cmis-deleteChildren", $(library.element).attr("id"));

							// Go back to the document list if the user clicked
							// on the delete icon on the detailed view
							if ($(library.element).find(".documentlist:visible").length == 0) {
								$(library.element).find(".documentdetail").fadeOut(400, function() {
									$(library.element).find(".action-header").fadeIn();
									$(library.element).find(".documentlist").fadeIn(400, function() {
										$(library.element).find("#overlay").fadeOut();
									})
								});
							}
						} else {
							// Add an error
							library._addError("Can't delete the object " + row.id + ".");
							$(library.element).find("#overlay").fadeOut();
						}
					}
				}
			});
		});
	};

	/**
	 * Event handler when the user clicks on the preview icon
	 * 
	 * @icon: Preview icon
	 */
	Library.prototype._onClickPreviewDocument = function(icon) {
		var library = this;
		var session = library.options.cmis.session;

		// Get the row containing the icon
		var row = $(icon).closest("tr.cmis-library-row");
		// Get the ObjectID
		var objectId = $(row).attr('versionSeriesId');
		// Get the file name
		var fileName = $(row).find('td.cmis-name').html();

		// Hide the list of actions
		$(library.element).find(".more-actions-popup").fadeOut();

		// Compute the dimension of the previewers
		var width = $(library.element).find(".documentlist").width();
		var height = $(library.element).find(".documentlist").height();
		if (height < 550)
			height = 550;
		var documentUrl = session.getContentStreamURL(objectId, 'inline');

		// Compute the list of headers required by the previewer
		var headers = {};
		if ($.ajaxSettings.headers != null)
			headers = JSON.parse(JSON.stringify($.ajaxSettings.headers));
		if (session.getToken() != null) {
			// Append the token at the document URL
			var tokenName = Object.keys(session.getToken())[0];
			var tokenValue = session.getToken()[tokenName];
			documentUrl += "&" + tokenName + "=" + tokenValue;
		} else {
			var hash = btoa(session.getCredentials());
			headers["Authorization"] = "Basic " + hash;
		}

		// Create the previewer URL
		var path = 'Viewer.js/';
		var mimetype = $(row).attr("mimetype");
		if (typeof library.options.previewOptions !== undefined && library.options.previewOptions[mimetype] != null) {
			if (library.options.previewOptions[mimetype].viewerPath != null)
				path = library.options.previewOptions[mimetype].viewerPath;
		}

		var _url = path + 'index.aspx#' + JSON.stringify(headers) + "||" + documentUrl + "&" + fileName.slice(fileName.lastIndexOf('.'));

		// Append the previewer
		$(library.element).find(".documentpreview").empty();
		$(library.element).find(".documentpreview").append('<div enabled="true" class="icon icon-back icon-back-documents">Back to documents list</div>');
		$(library.element).find(".documentpreview").append("<iframe id='viewer' src = '" + _url + "' width='" + width + "' height='" + height + "' allowfullscreen webkitallowfullscreen></iframe>")

		// Show the previewer
		$(library.element).find(".action-header").fadeOut();
		$(library.element).find(".documentlist").fadeOut(400, function() {
			$(library.element).find(".documentpreview").fadeIn(400, function() {

			});
		});

		// Attach an event to the "Back to document" icon
		$(library.element).find(".documentpreview .icon-back-documents").click(function() {
			$(library.element).find(".documentpreview").fadeOut(400, function() {
				$(library.element).find(".action-header").fadeIn();
				$(library.element).find(".documentlist").fadeIn();
			});
		});
	};

	/**
	 * Event handler when the user clicks on the versions icon
	 * 
	 * @icon: Show versions icon
	 */
	Library.prototype._onClickCheckVersions = function(icon) {
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr.cmis-library-row");
		var objectId;
		var container;
		// If the user clicked on the icon in the document list
		if (row.length > 0) {
			container = $(library.element).find(".documentlist");
			objectId = $(row).attr('versionSeriesId');
		} else {
			// We clicked on the icon in the detailed view
			objectId = $(icon).closest(".detail-actions").attr('versionSeriesId');
			container = $(library.element).find(".documentdetail");
		}

		var session = this.options.cmis.session;

		$(library.element).find("#overlay").fadeIn(400, function() {
			$(library.element).find(".action-header").fadeOut();
			$(container).fadeOut(400, function() {

				// Get all versions of this node
				session.getAllVersions(objectId, {
					includeAllowableActions : true,
					request : {
						success : function(data) {
							// Display each verions
							$(library.element).find(".documentversion").empty();
							library._displayVersions(data);

							// Create the back action template depending if the
							// user is on the "Documents" view or "Document
							// Detail" view
							var backActionTpl;
							if ($(container).hasClass("documentdetail"))
								backActionTpl = $('<div><div class="detail-actions"><div class="icon icon-back icon-back-document" enabled="true">Back to document</div></div></div>');
							else
								backActionTpl = $('<div><div class="detail-actions"><div class="icon icon-back icon-version-back-documents" enabled="true">Back to document list</div></div></div>');

							// Generate the bacj action
							var backAction = library._generateElement(data[0], backActionTpl);
							// Append the back action
							$(library.element).find(".documentversion").append(backAction);
							// Attach events to the back action
							library._attachActions(backAction);

							// Display the list of versions
							$(library.element).find(".documentversion").fadeIn();
							$(library.element).find(".documentversion").css("display", "table");
							$(library.element).find("#overlay").fadeOut();
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an error message
							library._addError("Can't get versions of the object " + objectId + " in the repository.");
							$(library.element).find("#overlay").fadeOut();
						}
					}
				});

			});
		});
	};

	/**
	 * Event handler when the user clicks on the check-out icon
	 * 
	 * @icon: Check-out icon
	 */
	Library.prototype._onClickCheckOutDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr");
		// Get the object ID
		var objectId = $(row).prop('id');

		$(library.element).find("#overlay").fadeIn(400, function() {

			// Check-out the document
			session.checkOut(objectId, {
				request : {
					success : function(data) {
						// Refresh the list of documents
						library._refresh();
						$(library.element).find("#overlay").fadeOut();
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error
						library._addError("Can't check-out the object " + objectId + " in the repository.");
						$(library.element).find("#overlay").fadeOut();
					}
				}
			});

		});
	};

	/**
	 * Event handler when the user clicks on the check-in icon
	 * 
	 * @icon: Check-in icon
	 */
	Library.prototype._onClickCheckInDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr");
		var table = $(row).closest("table");
		// Get the object ID
		var objectId = $(row).prop('id');
		// Get the object series ID
		var versionSeriesId = $(row).attr('versionSeriesId');

		// Hide the list of actions
		$(library.element).find(".more-actions-popup").fadeOut();

		$(library.element).find("#overlay").fadeIn(400, function() {

			// Delete all update rows
			$(table).find("td.uploadRow").closest("tr").remove();

			// Append a new row in the table to display the update panel
			var nbOfCells = $(row).find("td").length;
			$(row).after("<tr><td class='checkInRow uploadRow' colspan='" + nbOfCells + "'><div class='checkIn'></div></td></tr>");
			var newLine = $(row).closest("table").find(".checkInRow");
			$(newLine).find(".checkIn").append("<label for='fileselect'>Files to upload:</label><input id='fileselect' type='file' autocomplete='off' name='fileselect[]' multiple='multiple'><br />");
			$(newLine).find(".checkIn").append("<label for='comment'>Comment:</label><input type='text' name='comment'/><br/>");
			$(newLine).find(".checkIn").append("<label for='major'>Major change?</label><input type='checkbox' name='major'/><br/>");
			$(newLine).find(".checkIn").append("<button id='checkInButton' type='button'>Check-In</button>");
			$(newLine).find(".checkIn").append("<button id='cancelButton' type='button'>Cancel</button>");

			// Attach an event to the checkin button
			$(newLine).find("#checkInButton").click(function(e) {
				e.preventDefault();

				// Get information
				var fileSelect = $(newLine).find(".checkIn input[type='file']")[0];
				var documentName = $(row).find("td.cmis-name").html();
				var comment = $(newLine).find(".checkIn input[name='comment']").val();
				var major = ($(newLine).find(".checkIn input[name='major']:checked").length == 1);

				$(library.element).find("#overlay").fadeIn(400, function() {

					// Check-in the document
					session.checkIn(objectId, major, documentName, fileSelect.files[0], comment, null, null, null, {
						request : {
							success : function(data) {
								$(library.element).find("#overlay").fadeOut();
								// Refresh the list of documents
								library._refresh();
							},
							error : function(e) {
								// Display an error message
								library._addError("Can't check-in the object " + objectId + " in the repository.");
								$(library.element).find("#overlay").fadeOut();
							}
						}
					});
				});

			});
			$(newLine).find("#cancelButton").click(function(e) {
				// Delete all update rows
				$(table).find("td.uploadRow").closest("tr").remove();
			});

			$(library.element).find("#overlay").fadeOut();
		});
	};

	/**
	 * Event handler when the user clicks on the update icon
	 * 
	 * @icon: Update icon
	 */
	Library.prototype._onClickUpdateDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr");
		var table = $(row).closest("table");
		// Get the object ID
		var objectId = $(row).prop('id');

		// Hide the list of actions
		$(library.element).find(".more-actions-popup").fadeOut();

		$(library.element).find("#overlay").fadeIn(400, function() {

			// Delete all update rows
			$(table).find("td.uploadRow").closest("tr").remove();

			// Append a new row in the table to display the update panel
			var nbOfCells = $(row).find("td").length;
			$(row).after("<tr><td class='uploadRow updateRow' colspan='" + nbOfCells + "'><div class='update'></div></td></tr>");
			var newLine = $(row).closest("table").find(".updateRow");
			$(newLine).find(".update").append("<label for='fileselect'>Files to upload:</label><input id='fileselect' type='file' autocomplete='off' name='fileselect[]' multiple='multiple'><br />");
			$(newLine).find(".update").append("<button id='updateButton' type='button'>Update</button>");
			$(newLine).find(".update").append("<button id='cancelUpdateButton' type='button'>Cancel</button>");

			// Attach an event to the update button
			$(newLine).find("#updateButton").click(function(e) {
				e.preventDefault();

				// Get information
				var fileSelect = $(newLine).find(".update input[type='file']")[0];
				var comment = $(newLine).find(".update input[name='comment']").val();
				var mimeType = fileSelect.files[0].type;

				$(library.element).find("#overlay").fadeIn(400, function() {

					// Update the content of the document
					session.setContentStream(objectId, fileSelect.files[0], true, mimeType, {
						request : {
							success : function(data) {
								$(library.element).find("#overlay").fadeOut();
								// Refresh the list of documens
								library._refresh();
							},
							error : function(e) {
								// Display an error
								library._addError("Can't update the object " + objectId + " in the repository.");
								$(library.element).find("#overlay").fadeOut();
							}
						}
					});

				});
			});
			$(newLine).find("#cancelUpdateButton").click(function(e) {
				// Delete all update rows
				$(table).find("td.uploadRow").closest("tr").remove();
			});

			$(library.element).find("#overlay").fadeOut();
		});
	};

	/**
	 * Event handler when the user clicks on the cancel check-out icon
	 * 
	 * @icon: Cancel check-out icon
	 */
	Library.prototype._onClickCancelCheckOutDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr");
		// Get the object ID
		var objectId = $(row).prop('id');

		$(library.element).find("#overlay").fadeIn(400, function() {
			// Cancel check-out of this node
			session.cancelCheckOut(objectId, {
				request : {
					complete : function(e, textStatus, errorThrown) {
						if (e.status == 200) {
							// Refresh the list of documents
							library._refresh();
							$(library.element).find("#overlay").fadeOut();
						} else {
							// Display an error
							library._addError("Can't cancel check-out the object " + objectId + " in the repository.");
							$(library.element).find("#overlay").fadeOut();
						}
					}
				}
			});

		});
	};

	/**
	 * Event handler when the user clicks on the logout button
	 */
	Library.prototype._onClickLogout = function() {
		var library = this;

		$(library.element).find(".library").fadeOut(400, function() {
			// Broadcast logout message
			library._broadcastMessage("cmis-logout", null);

			// Reset all authentication parameters
			library.options.cmis.session = null;
			library.options.cmis.username = null;
			library.options.cmis.password = null;

			// Clean stored credentials
			library._cleanCredentials();

			// Clean items
			$(library.element).find(".library .documentlist .tableHeader").empty();
			$(library.element).find(".library .documentlist .tableBody").empty();

			// Hide items
			$(library.element).find(".library div.panel").fadeOut();

			// Reload the component
			library._preload();
		})
	};

	/**
	 * Event handler when the user clicks on the login button
	 */
	Library.prototype._onClickLogin = function() {
		var library = this;

		// Check paramaters
		library._checkLoginParameters(function(session) {
			// Save the current session
			library.options.cmis.session = session;

			if (session.getToken() != null) {
				// Save the token
				var token = session.getToken();
				library.options.cmis.token = token;

				// Store the credentials
				if ($(library.element).find(".login input[name='remember']").is(':checked'))
					library._storeCredentials("token", JSON.stringify(session.getToken()));

				// Broadcast message
				library._broadcastMessage("cmis-login", JSON.stringify(token));
			} else {
				// Save the username and password
				var credentials = session.getCredentials().split(":");
				library.options.cmis.username = credentials[0];
				library.options.cmis.password = credentials[1];

				// Store the credentials
				if ($(library.element).find(".login input[name='remember']").is(':checked'))
					library._storeCredentials("basic", session.getCredentials());

				// Broadcast message
				library._broadcastMessage("cmis-login", session.getCredentials());

				// Refresh the user actions
				library._refreshUserActions();
			}

			// Empty form fields
			$(library.element).find(".login input[type='text'], .login input[type='password']").val("");

			// Display the library
			$(library.element).find(".login").fadeOut(400, function() {
				$(library.element).find(".library").fadeIn();
				if (library.options.autoLoad)
					library._load();
			});
		}, function() {
			library._addError("Can't login with these credentials.");
		});
	};

	/**
	 * Check if the authentication parameters are valid or not
	 */
	Library.prototype._checkLoginParameters = function(successFn, errorFn) {
		var library = this;

		// Get the parameters
		var username = $(library.element).find(".login input[name='username']").val();
		var password = $(library.element).find(".login input[name='password']").val();

		// Check parameters
		if (username.length == 0 || password.length == 0)
			library._addError("Please fill all parameters.");
		else {
			// Check if it's working or not
			var session = cmis.createSession(library.options.cmis.serverUrl);
			session.setCredentials(username, password).loadRepositories({
				request : {
					success : function(data) {
						if (successFn != null)
							successFn(session);
					},
					error : function(jqXHR, textStatus, errorThrown) {
						if (errorFn != null)
							errorFn(jqXHR, textStatus, errorThrown);
					}
				}
			});
		}
	};

	/**
	 * Store credentials to be able to re-use it later
	 */
	Library.prototype._storeCredentials = function(credentials) {
		// NOT SUPPORTED
		return null;
	};

	/**
	 * Retrieve credentials
	 */
	Library.prototype._retrieveCredentials = function(_success) {
		// NOT SUPPORTED
		_success();
	};

	/**
	 * Clean credentials
	 */
	Library.prototype._cleanCredentials = function() {
		// NOT SUPPORTED
		return null;
	};

	/**
	 * Publish messages
	 */
	Library.prototype._broadcastMessage = function(fn, data) {
		var library = this;

		// Check if a component is registered
		if (!library.useMessages)
			$(library.register.cmis.components).each(function() {
				if (this.subscribe && this.subscribe[fn])
					this.subscribe[fn](data);
			});
		else
			// Send a broadcasting message
			parent.postMessage('{"name":"' + fn + '", "params":["' + data + '"]}', "*");
	}

	/**
	 * Event handler when the user clicks on the icon to view more actions
	 * 
	 * @icon: More action icons
	 */
	Library.prototype._onClickMoreActions = function(icon) {
		var library = this;
		// Get the row containing the icon
		var row = $(icon).closest("tr");
		// Get the table
		var table = $(row).closest("table");
		// Get the action pop-up
		var actions = $(row).find(".more-actions-popup");
		// Get the cell
		var cell = $(icon).closest("td");

		if ($(actions).is(":visible")) {
			$(actions).fadeOut();
		} else {
			// Hide all popup
			$(table).find(".more-actions-popup").fadeOut();
			// Change the position
			actions.css("top", $(icon).offset().top - 2);
			actions.css("left", $(icon).offset().left - 235);
			// Display
			actions.fadeIn();
		}
	};

	/**
	 * Event handler when the user clicks on the view properties icon
	 * 
	 * @icon: View properties icon
	 */
	Library.prototype._onClickViewDocument = function(icon) {
		var session = this.options.cmis.session;
		var library = this;

		// Get the row containing the icon
		var row = $(icon).closest("tr");
		// Get the object ID
		var objectId = $(row).prop('id');

		$(library.element).find("#overlay").fadeIn(400, function() {
			$(library.element).find(".action-header").fadeOut();
			$(library.element).find(".documentlist").fadeOut(400, function() {

				// Get properties of this object
				session.getObject(objectId, "latest", {
					includeAllowableActions : true,
					request : {
						success : function(data) {
							// Display the detailed view of this node
							library._displayDetails(data);

							$(library.element).find(".documentdetail").fadeIn();
							$(library.element).find(".documentdetail").css("display", "table");
							$(library.element).find("#overlay").fadeOut();
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an erro
							library._addError("Can't get the object " + objectId + " in the repository.");
							$(library.element).find("#overlay").fadeOut();
						}
					}
				});

			});
		});
	};

	/**
	 * Event handler when the user clicks on an advanced search form
	 * 
	 * @form: Form to display
	 */
	Library.prototype._onClickAdvancedSearchForm = function(form) {
		var library = this;

		// Hide the list of advanced search forms
		$(library.element).find(".query .advanced-search").fadeOut();

		$(library.element).find("#overlay").fadeIn(400, function() {
			$(library.element).find(".action-header .uploadDocument,.documentdetail,.documentlist,.documentpreview,.advanced-search-form").fadeOut(400).promise().done(function() {

				// Save the type of the form
				$(library.element).find(".advanced-search-form").attr("cmisType", $(form).attr("cmisType"))
				// Append the form to the HTML page
				$(library.element).find(".advanced-search-form").html($(form).html());
				// Configure the search button
				$(library.element).find(".advanced-search-form .search-button").click(function() {
					library._onClickAdvancedSearch();
				});
				// Check if there is custom display configuration
				$(library.element).find(".advanced-search-form input, .advanced-search-form select").each(function(index, input) {
					var field = $(input).attr("field");

					if (field != null)
						// Check if there is a custom behavior
						if (library.options.display.search != null)
							if (library.options.display.search[field] != null)
								library.options.display.search[field](input, library);
				});

				// Display the form
				$(library.element).find("#overlay").fadeOut();
				$(library.element).find(".advanced-search-form").fadeIn();
			});
		});
	};

	/**
	 * Event handler when the user clicks on the search button in an advanced
	 * search form
	 */
	Library.prototype._onClickAdvancedSearch = function() {
		var library = this;

		var advancedSearch = $(library.element).find(".advanced-search-form");

		var inputs = $(".advanced-search-form input, .advanced-search-form select");
		var queryParams = new Object();
		$(inputs).each(function(index, input) {
			var field = $(input).attr("field");
			var cmisPropertyType = $(input).attr("cmisPropertyType");
			if (field != null) {
				var value = $(input).val();

				if (value != null && value.length > 0)
					if (cmisPropertyType.toLowerCase() == "string")
						// Add the query parameters
						queryParams[field] = {
							type : 'string',
							value : value
						};
					else if (cmisPropertyType.toLowerCase() == "date") {
						var rangeOperator = $(input).attr("rangeOperator");
						// Initialize the field
						if (queryParams[field] == null)
							queryParams[field] = {
								type : "date"
							};

						// Save the operator
						queryParams[field][rangeOperator] = value;
					} else if (cmisPropertyType.toLowerCase() == "int" || cmisPropertyType.toLowerCase() == "float" || cmisPropertyType.toLowerCase() == "double" || cmisPropertyType.toLowerCase() == "real") {
						var rangeOperator = $(input).attr("rangeOperator");
						// Initialize the field
						if (queryParams[field] == null)
							queryParams[field] = {
								type : cmisPropertyType.toLowerCase()
							};

						// Save the operator
						queryParams[field][rangeOperator] = value;
					}
			}
		});

		// If the query params is not empty
		if (Object.keys(queryParams).length > 0)
			library._onClickSearch(null, queryParams);
	};

	/**
	 * Display the detailed panel of a document
	 * 
	 * @data: Object to display
	 */
	Library.prototype._displayDetails = function(data) {
		var library = this;
		var session = this.options.cmis.session;

		// Get the CMIS type
		var cmisType = data.properties["cmis:objectTypeId"].value;
		// Get the object ID
		var objectId = data.properties["cmis:objectId"].value;

		// Search the appropriate detail template
		var libraryDetailTemplate = $("#cmis-library-detail-template[cmisType='" + cmisType + "']");
		if (libraryDetailTemplate.length == 0)
			libraryDetailTemplate = $("#cmis-library-detail-template[cmisType='_global']");

		if (libraryDetailTemplate != null && libraryDetailTemplate.length > 0) {
			// Generate HTML
			var detail = library._generateElement(data, libraryDetailTemplate);

			// Attach the HTML
			$(library.element).find(".documentdetail").html(detail);

			// Attach actions
			library._attachActions(detail);
		}
	};

	/**
	 * Display the list of version for a specific node
	 * 
	 * @data: Array of versions to display
	 */
	Library.prototype._displayVersions = function(data) {
		var session = this.options.cmis.session;
		var library = this;

		// Create the versions element
		$(library.element).find(".documentversion").append('<div class="versions"></div>');

		// For each version
		$(data).each(function(index) {
			var data = this;
			var objectId = data.properties["cmis:objectId"].value;

			// Generate HTML
			var version = library._generateElement(data, $("#cmis-library-version-template"));

			// Attach the version
			$(library.element).find(".documentversion .versions").append(version);

			// Attach actions
			library._attachActions(version);
		});
	};

	/**
	 * Attach actions to the icons on the right panel
	 * 
	 * @element: HTML elemenet containing the actions
	 */
	Library.prototype._attachActions = function(element) {
		var library = this;
		var session = library.options.cmis.session;

		// Hide useless icon
		$(element).find(".icon[enabled='false']").hide();

		// Hide preview icon if needed
		$(element).find(".icon-preview").each(function() {
			var mimeType = $(this).attr("mimeType");
			if (library.options.previewMIMETypes.indexOf(mimeType) == -1)
				$(this).hide();
		});

		// Attach actions
		$(element).find(".icon-view").click(function(event, index) {
			library._onClickViewDocument(this);
		});
		$(element).find(".icon-update").click(function(event, index) {
			event.preventDefault();
			library._onClickUpdateDocument(this);
			return false;
		});
		$(element).find(".icon-checkin").click(function(event, index) {
			event.preventDefault();
			library._onClickCheckInDocument(this);
			return false;
		});
		$(element).find(".icon-checkout").click(function(event, index) {
			event.preventDefault();
			library._onClickCheckOutDocument(this);
			return false;
		});
		$(element).find(".icon-cancel-checkout").click(function(event, index) {
			library._onClickCancelCheckOutDocument(this);
		});
		$(element).find(".icon-back-documents").click(function(event, index) {
			$(library.element).find(".documentdetail").fadeOut(400, function() {
				$(library.element).find(".more-actions-popup").hide();
				$(library.element).find(".action-header").fadeIn();
				$(library.element).find(".documentlist").fadeIn();
			});
		});
		$(element).find(".icon-version-back-documents").click(function(event, index) {
			$(library.element).find(".documentversion").fadeOut(400, function() {
				$(library.element).find(".more-actions-popup").hide();
				$(library.element).find(".documentlist").fadeIn();
				$(library.element).find(".action-header").fadeIn();
			});
		});
		$(element).find(".icon-back-document").click(function(event, index) {
			$(library.element).find(".more-actions-popup").hide();
			$(library.element).find(".documentversion").fadeOut(400, function() {
				$(library.element).find(".documentdetail").fadeIn(400, function() {
					$(library.element).find(".documentdetail").css("display", "table");
				});
			});
		});
		$(element).find(".icon-preview").click(function(event, index) {
			library._onClickPreviewDocument(this);
		});
		$(element).find(".icon-version[enabled='true']").click(function(event, index) {
			library._onClickCheckVersions(this);
		});
		$(element).find(".icon-delete[enabled='true']").click(function(event, index) {
			library._onClickDeleteDocument(this);
		});
		$(element).find(".icon-edit[enabled='true']").click(function(event, index) {
			library._onClickEditFolder(this);
		});
		$(element).find(".icon-more").click(function(event, index) {
			library._onClickMoreActions(this);
		});
		$(element).find(".icon-close").click(function(event, index) {
			$(this).closest(".more-actions-popup").fadeOut();
		});
	};

	/**
	 * Generates HTML code from a template and a JSON object
	 * 
	 * @data: JSON object used as data source
	 * @template: HTML template
	 */
	Library.prototype._generateElement = function(data, template) {
		var library = this;
		var session = library.options.cmis.session;

		var newElem = template.html();
		var objectId = data.properties["cmis:objectId"].value;

		// Replace properties
		$(Object.keys(data.properties)).each(function(index, argName) {
			var regexp = new RegExp('\\$\\{' + argName + '\\}', 'g');

			var value = data.properties[argName].value;
			var type = data.properties[argName].type;

			// Check if there is a custom dispaly function for this property
			if (library.options.display.property != null && library.options.display.property[argName] != null)
				value = library.options.display.property[argName](value, data);
			else if (library.options.display.type != null && library.options.display.type[type] != null)
				value = library.options.display.type[type](value, data);

			newElem = newElem.replace(regexp, value);
		});

		// Replace allowable actions
		$(Object.keys(data.allowableActions)).each(function(index, argName) {
			var regexp = new RegExp('\\$\\{' + argName + '\\}', 'g');
			newElem = newElem.replace(regexp, data.allowableActions[argName]);
		});

		// Replace pending elements
		var regexp = new RegExp('\\$\\{[A-Za-z0-9\-:_]*\\}', 'g');
		newElem = newElem.replace(regexp, "");

		newElem = $(newElem);

		// Replace the download URL
		var url = session.getContentStreamURL(objectId, 'attachment');
		newElem.find(".icon-download a, .download a").attr("href", url);
		newElem.find(".icon-download").click(function() {
			window.open(url);
		});

		return newElem;
	};

	/**
	 * Event handler when the user clicks on the search icon
	 * 
	 * @pageIndex: Page to display
	 * @queryParams: Object that contains the parameter
	 */
	Library.prototype._onClickSearch = function(pageIndex, queryParams) {
		var library = this;
		var session = this.options.cmis.session;

		var whereCondition;
		// By default, we search document
		var cmisType = library.options.cmis.searchObjectTypeId;

		if (queryParams == null && library.options.query == null) {

			// Get the query value from the input field
			var queryValue = $(library.element).find("#queryValue").val();
			whereCondition = "CONTAINS('" + queryValue + "')";

			// Delete params
			delete library.options.query;
		} else {

			if (queryParams == null)
				queryParams = library.options.query;

			// We build the where condition
			whereCondition = "";

			$(Object.keys(queryParams)).each(function(index, field) {
				var param = queryParams[field];
				if (param.type == "string") {
					if (whereCondition.length > 0)
						whereCondition += " AND ";

					whereCondition += field + " LIKE '%" + param.value + "%'";
				} else if (param.type == "int" || param.type == "double" || param.type == "float" || param.type == "real") {

					if (param.from != null) {
						if (whereCondition.length > 0)
							whereCondition += " AND ";
						whereCondition += field + " >= " + param.from;
					}

					if (param.to != null) {
						if (whereCondition.length > 0)
							whereCondition += " AND ";
						whereCondition += field + " <= " + param.to;
					}
				} else if (param.type == "date") {
					var regexp = /\d{4}-\d{1,2}-\d{1,2}/;

					// Check the from parameter
					if (param.from != null) {
						var value = param.from;
						// Check the value
						if (value.match(regexp) != null) {
							if (whereCondition.length > 0)
								whereCondition += " AND ";

							whereCondition += field + " >= TIMESTAMP '" + value + "T00:00:00.000+00:00'";
						}
					}

					// Check the to parameter
					if (param.to != null) {
						var value = param.to;
						// Check the value
						if (value.match(regexp) != null) {
							if (whereCondition.length > 0)
								whereCondition += " AND ";

							whereCondition += field + " <= TIMESTAMP '" + value + "T23:59:59.999+00:00'";
						}
					}

				}
			});

			// We get the content type
			cmisType = $(library.element).find(".advanced-search-form").attr("cmisType");

			// Save the params
			library.options.query = queryParams;
		}

		// Save the current state
		library.options.search_mode = true;

		if (whereCondition.length > 0) {

			$(library.element).find("#overlay").fadeIn(400, function() {

				// Delete the pagination
				$(library.element).find(".pagination").remove();

				// Compute the page index
				if (pageIndex == null || pageIndex == NaN)
					pageIndex = 1;

				// Store the current page
				$(library.element).attr("currentPage", pageIndex);

				// Compute the maximum number of items
				var maxItems = parseInt(library.options.maxItems);
				if (maxItems < 1 || isNaN(maxItems))
					maxItems = 20;

				// Get the order by instruction
				var orderBy = "cmis:baseTypeId DESC,cmis:name";
				if (library.options.sort != null) {
					var field = library.options.sort.field;
					var order = library.options.sort.order;

					if (field != null)
						orderBy = field + " " + order;
				}

				// Compute the query
				var query = "SELECT * FROM " + cmisType + " WHERE " + whereCondition + " ORDER BY " + orderBy;
				console.log(query)

				// Send the query
				session.query(query, false, {
					includeAllowableActions : true,
					skipCount : (pageIndex - 1) * maxItems,
					maxItems : maxItems,
					request : {
						success : function(data) {
							// Display the result of the query
							library._displayQueryResult(data.results);
							// Append the pagination block
							library._appendPagination(data.hasMoreItems, data.numItems, "_onClickSearch");
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an error message
							library._addError("Can't execute the query " + query + ".");
						}
					}
				});
			});
		}
	}

	/**
	 * Displays an error message
	 * 
	 * @msg: Error message
	 */
	Library.prototype._addError = function(msg) {
		var library = this;
		var newElem = $(library.element).find(".errors").append("<div class='error'>" + msg + "</div>");
		$(newElem).find(".error").click(function() {
			$(this).fadeOut(500, function() {
				$(this).remove();
			});
		});
		$(library.element).find("#overlay").fadeOut();
	};

	// Define the plugin
	$.fn[pluginName] = function(options) {
		return this.each(function() {
			if (!$.data(this, 'plugin_' + pluginName)) {
				$.data(this, 'plugin_' + pluginName, new Library(this, options));
			}
		});
	}

})(jQuery, window, document);
