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
 * Browser UI component based on the CMIS 1.1 JS Connector
 * 
 * Developer(s): - Ben Chevallereau (ben.chevallereau@armedia.com /
 * benjamin.chevallereau@gmail.com)
 * 
 * Version: 1.1 (05-09-2014)
 * 
 * This JS library can be used to any CMIS 1.1 compliant repository.
 */

;
(function($, window, document, undefined) {

	// Plugin name
	var pluginName = 'cmisbrowser';

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
			initPath : null
		},
		// List of types to do not display
		excludingFilter : [],
		// Expand the root node during the first loading (Optional)
		openRootNode : true,
		// Use messages for the communication between UI components (Optional)
		useMessages : false
	};

	// Pluging constructor
	function Browser(element, options) {
		this.element = element;

		this.options = $.extend({}, defaults, options);

		this._defaults = defaults;
		this._name = pluginName;

		this.init();

		this._alfLogin();
	}

	/**
	 * Initialisation method.
	 */
	Browser.prototype.init = function() {
		var browser = this;

		// Register the UI component
		browser._register();

		// Check if templates have been loaded or not
		var body = $(this.element).closest("body");
		if (body.find(".cmisBrowserTemplates").length == 0)
			$(body).append("<div class='cmisBrowserTemplates'></div)");
		var path = "";

		// Search the script tag related to this library
		$("script").each(function() {
			var src = $(this).attr("src");
			if (src) {
				var fileName = src.slice(src.lastIndexOf("/") + 1);
				if (fileName.lastIndexOf("?") != -1)
					fileName = fileName.slice(0, fileName.lastIndexOf("?"));
				if (fileName === "browser.js")
					path = src.substring(0, src.lastIndexOf("/"));
			}
		});

		// Load dinamycally the file templates.html
		body.find(".cmisBrowserTemplates").load(path + "/template.html", null, function complete(responseText, textStatus, jqXHR) {
			// Load the main component
			$(browser.element).html($(".cmisBrowserTemplates").find("#cmis-browser-template").html());

			// Attach action on the load check out docs
			$(browser.element).find(".getCheckedOutDocs").click(function() {
				// Send a broadcasting message
				browser._broadcastMessage("cmis-getCheckedOutDocs", "");
			});

			if (browser.options.cmis.username == null || browser.options.cmis.username.length == 0 || browser.options.cmis.password == null || browser.options.cmis.password.length == 0) {
				// Display the login message
				$(browser.element).find(".login").fadeIn();
			} else {
				// Display the browser
				$(browser.element).find(".browser").fadeIn();
				// Load the UI component
				browser._load();
			}
		});
	};

	/**
	 * Hack - log in to Alfresco API in the background
	 */
	Browser.prototype._alfLogin = function() {
		// Login to Alfresco API
		//var client = new XMLHttpRequest();
		//var baseUrl = this.options.cmis.serverUrl.replace("/api/-default-/public/cmis/versions/1.1/browser", "");
		//client.open("POST", baseURL + "/s/api/login", false);
		//client.send("{ username: '" + this.options.cmis.username + "', password: '" + this.options.cmis.password + "' }");
		// and now get ticket from response?
		// TODO currently the first request to Alfresco API asks for login - could we avoid that by doing it behind the scenes for the user?
	};

	/**
	 * Register the UI component to allow communication between components.
	 */
	Browser.prototype._register = function() {
		var browser = this;

		// By default, events are registered in jQuery
		var container = $;

		// If the component is stored in an Iframe
		if (top != self) {
			// Create the container object that will be local to this component
			container = new Object();
			// Identify that we'll use messages to communicate
			browser.useMessages = true;

			// Define the listener used for messages
			function listener(event) {
				console.log("Received event: " + event.data);
				// Get event information
				var eventData = JSON.parse(event.data);
				if (browser.register.cmis.components)
					// For each component
					$(browser.register.cmis.components).each(function() {
						// If this component has a subscribe eveny
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
			type : 'browser',
			// This component will trigger 4 kind of events
			events : [ 'cmis-clickFolder', 'cmis-createFolder', 'cmis-deleteFolder', 'cmis-getCheckedOutDocs' ],
			subscribe : {
				// The browser component will listen if the user is logging in
				// and out
				"cmis-login" : function(credentials) {

					// If credentials is an object, it's a token
					try {
						var token;
						if (typeof credentials === "object")
							token = credentials;
						else
							token = JSON.parse(credentials);
						browser.options.cmis.token = token;
					} catch (e) {
						// So if it's not an object, it's username:password
						browser.options.cmis.username = credentials.split(":")[0];
						browser.options.cmis.password = credentials.split(":")[1];
					}

					// Load the browser
					$(browser.element).find(".login").fadeOut(400, function() {
						// Display the browser
						$(browser.element).find(".browser").fadeIn();
						// Load the UI component
						browser._load();
					});
				},
				// The browser component will receive only events when a node
				// has been deleted
				"cmis-deleteChildren" : function(folderId) {
					// Refresh the folder
					var folderItem = $("div.menu-item[id='" + folderId + "']");
					browser._openFolder(folderItem, false);
				},
				"cmis-logout" : function() {
					// Reset all authentication parameters
					browser.options.cmis.session = null;
					browser.options.cmis.token = null;
					browser.options.cmis.username = null;
					browser.options.cmis.password = null;

					// Clean the browser element
					$(browser.element).find("ul.root").empty();

					// Hide the browser
					$(browser.element).find(".browser").fadeOut();
				}
			}
		});

		// Store the container
		browser.register = container;
	};

	/**
	 * Load the browser tree
	 */
	Browser.prototype._load = function() {
		var browser = this;

		// If the component is not correctly configured
		if (null === this.options.cmis.serverUrl || (null == this.options.cmis.username && null == this.options.cmis.password && null == this.options.cmis.token)) {
			browser._addError("Please configure the browser before to initialize it.");
		} else {
			// Test if the session already exists
			if (null == browser.options.cmis.session) {
				// Initialize the session
				var session = cmis.createSession(browser.options.cmis.serverUrl);

				// If we use username password
				if (browser.options.cmis.username && browser.options.cmis.password)
					session.setCredentials(browser.options.cmis.username, browser.options.cmis.password);
				else
					session.setToken(browser.options.cmis.token);

				session.loadRepositories({
					request : {
						success : function(data) {
							// Save the current session
							browser.options.cmis.session = session;
							// Display root folder
							browser._displayRootFolder();
						},
						error : function(jqXHR, textStatus, errorThrown) {
							// Display an error
							var msg = "Error during the connexion: ";
							if (null === textStatus)
								msg += textStatus;
							browser._addError(msg);
						}
					}
				});
			} else
				// If the session already exists
				this._displayRootFolder();
		}
	};

	/**
	 * Display the root folder
	 */
	Browser.prototype._displayRootFolder = function() {
		var session = this.options.cmis.session;
		var browser = this;

		// If the initial path is configured
		if (null != this.options.cmis.initPath) {

			// Get the object corresponding to this path
			session.getObjectByPath(this.options.cmis.initPath, {
				includeAllowableActions : true,
				request : {
					success : function(data) {
						// Append the root node
						browser._appendItem(null, data);
						// If we have to expand the root node
						if (browser.options.openRootNode)
							// Click on the root node
							$(browser.element).find("div[id='" + data.properties['cmis:objectId'].value + "'] div.icon.icon-open").click();
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error message
						browser._addError("Can't get the object " + rootFolderId + " in the repository.");
					}
				}
			});

		} else {
			// Define the root folder id as root of the repository
			var rootFolderId = session.defaultRepository.rootFolderId;

			// If the initial object ID has been specified
			if (null != this.options.cmis.initObjectId)
				rootFolderId = this.options.cmis.initObjectId;

			// Get the object corresponding to this ID
			session.getObject(rootFolderId, 'latest', {
				includeAllowableActions : true,
				request : {
					success : function(data) {
						// Append the root node
						browser._appendItem(null, data);
						// If we have to expand the root node
						if (browser.options.openRootNode)
							// Click on the root node
							$(browser.element).find("div[id='" + data.properties['cmis:objectId'].value + "'] div.icon.icon-open").click();
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error message
						browser._addError("Can't get the object " + rootFolderId + " in the repository.");
					}
				}
			});
		}
	};

	/**
	 * Append item to an existing item in the browser component
	 * 
	 * @ulElem: reference to the UL tag corresponding to the parent node
	 * @data: JSON Object retrieved from CMIS
	 */
	Browser.prototype._appendItem = function(ulElem, data, isFile) {
		var browser = this;
		var parentItem;

		// If the UL element has not been defined
		if (ulElem == null)
			// We search the root UL tag
			parentItem = $(this.element).find("ul");
		else
			parentItem = ulElem;

		// Check the type
		if (this.options.excludingFilter.indexOf(data.properties["cmis:objectTypeId"].value) == -1) {
      if( isFile ) {
        var newFileItem = $("#cmis-browser-file-template").html();
        // Replace properties
        $(Object.keys(data.properties)).each(function(index, argName) {
            var regexp = new RegExp('\\$\\{' + argName + '\\}', 'g');
            newFileItem = newFileItem.replace(regexp, data.properties[argName].value);
        });        
        newFileItem = $(newFileItem);
		newFileItem.find(".icon-preview").click(function(event, index) {
            browser._onClickPreviewFile(this);
        });
		newFileItem.find(".icon-download").click(function(event, index) {
            browser._onClickDownloadFile(this);
        });
        $(parentItem).append(newFileItem);
      } else {
        var browserItemTemplate = $("#cmis-browser-item-template");
        var newItem = browserItemTemplate.html();
        // Replace properties
        $(Object.keys(data.properties)).each(function(index, argName) {
            var regexp = new RegExp('\\$\\{' + argName + '\\}', 'g');
            newItem = newItem.replace(regexp, data.properties[argName].value);
        });        
        // Replace allowable actions
        $(Object.keys(data.allowableActions)).each(function(index, argName) {
            newItem = newItem.replace('${' + argName + '}', data.allowableActions[argName]);
        });
        newItem = $(newItem);
        // Hide useless icon
        newItem.find(".icon[enabled='false']").hide();
        // Attach actions
        newItem.find(".icon-open, .label").click(function(event, index) {
            browser._onClickFolder(this);
        });
        newItem.find(".icon-delete[enabled='true']").click(function(event, index) {
            browser._onClickDeleteFolder(this);
        });
        newItem.find(".icon-edit[enabled='true']").click(function(event, index) {
            browser._onClickEditFolder(this);
        });
        newItem.find(".icon-add[enabled='true']").click(function(event, index) {
            browser._onClickAddFolder(this);
        });
        // Append the new item
        $(parentItem).append(newItem);
			}
		}
	};

	/**
	 * Click action handler
	 * 
	 * @elem: HTML element clicked
	 */
	Browser.prototype._onClickFolder = function(elem) {
		// Get the fodler item
		var folderItem = $(elem).closest(".menu-item");
		// Get the open icon
		var icon = $(folderItem).find(".icon-open");
		// If the folder is opened
		if ($(icon).hasClass("opened") && $(folderItem).hasClass("selected"))
			this._closeFolder(folderItem[0]);
		else
			this._openFolder(folderItem[0], true);
	};

	/**
	 * Open a folder
	 * 
	 * @folderItem: LI tag corresponding to a folder item
	 * @propagate: If equals to true, a message will be sent to other components
	 */
	Browser.prototype._openFolder = function(folderItem, propagate) {
		var session = this.options.cmis.session;
		var browser = this;

		$(this.element).find("#overlay").fadeIn(400, function() {

			// Get the folder id
			var objectId = $(folderItem).attr("id");
			// Get the list
			var list = $(folderItem).closest("li").find("ul");
			var dataFolders;

			$(browser.element).find(".menu-item").removeClass("selected");
			$(folderItem).addClass("selected");
			$(folderItem).find(".icon-open").addClass("opened");

			// If we have to propagate the event
			if (propagate)
				// Send a broadcasting message
				browser._broadcastMessage("cmis-clickFolder", objectId);

			// Search all folder contained in this folder
			session.query('select * from cmis:folder where IN_FOLDER(\'' + objectId + '\') order by cmis:name', false, {
				includeAllowableActions : true,
				request : {
					success : function(data) {
					  //{{{PX56
					  dataFolders = data;
            session.query('select * from cmis:document where IN_FOLDER(\'' + objectId + '\') order by cmis:name', false, {
                includeAllowableActions : true,
                request : {
                  success : function(data) {
                    // Empty the list of children
                    $(list).empty();
                    // Add all sub folders and files
                    $(dataFolders.results).each(function(index) {
                        browser._appendItem(list, this);
                    });
                    $(data.results).each(function(index) {
                        browser._appendItem(list, this, true);
                    });
                    // Allow to add new sub-folder
                    $(folderItem).find(".icon-add[enabled='true']").show();
                    $(browser.element).find("#overlay").fadeOut();
                  },
                  error : function(jqXHR, textStatus, errorThrown) {
                    // Display an error
                    browser._addError("Can't get files of " + objectId);
                    $(browser.element).find("#overlay").fadeOut();
                  }
                }
            });
            //}}}
					},
					error : function(jqXHR, textStatus, errorThrown) {
						// Display an error
						browser._addError("Can't get subfolders of " + objectId);
						$(browser.element).find("#overlay").fadeOut();
					}
				}
			});
		});
	};

	/**
	 * Close a folder
	 * 
	 * @folderItem: LI tag corresponding to a folder item
	 */
	Browser.prototype._closeFolder = function(folderItem) {
		var browser = this;
		$(browser.element).find("#overlay").fadeIn(400, function() {
			// Get the list
			var list = $(folderItem).closest("li").find("ul");
			// Empty the list of children
			list.empty();

			$(folderItem).find(".icon-open").addClass("closed");
			$(folderItem).find(".icon-open").removeClass("opened");
			$(folderItem).find(".icon-add[enabled='true']").hide();

			$(browser.element).find("#overlay").fadeOut();
		});
	};

	/**
	 * Delete action handler
	 * 
	 * @elem: HTML element clicked
	 */
	Browser.prototype._onClickDeleteFolder = function(icon) {
		var item = $(icon).closest(".menu-item");
		var list = $(item).closest("li");
		var session = this.options.cmis.session;
		var browser = this;

		$(browser.element).find("#overlay").fadeIn(400, function() {
			// Delete the object
			session.deleteTree($(item).prop('id'), true, 'deletesinglefiled', true, {
				request : {
					complete : function(e, textStatus, errorThrown) {
						if (e.status == 200) {
							if (null != e.responseJSON) {

								// Display an error
								var ids = "";
								$(e.responseJSON.ids).each(function() {
									if (ids.length > 0)
										ids += "; ";
									ids += this;
								});

								browser._addError("Can't delete these object(s): " + ids + ".");
								$(browser.element).find("#overlay").fadeOut();
							} else {

								var objectId = $(list).closest(".cmisbrowser").find("div.menu-item.selected").attr("id");
								// Send a broadcasting message
								browser._broadcastMessage("cmis-deleteFolder", objectId);

								$(list).remove();
								$(browser.element).find("#overlay").fadeOut();
							}
						} else {
							// Display an error
							browser._addError("Can't delete the object " + folderItem.id + ".");
							$(browser.element).find("#overlay").fadeOut();
						}
					}
				}
			});
		});
	};

	/**
	 * Edit action handler
	 * 
	 * @elem: HTML element clicked
	 */
	Browser.prototype._onClickEditFolder = function(icon) {
		var item = $(icon).closest(".menu-item");
		var name = $(item).find(".editText");
		// Enable the edit input field
		this._editFolderName(name[0]);
	},

	/**
	 * Create the input text for renaming
	 * 
	 * @actual: HTML tag to transform to editable input
	 */
	Browser.prototype._editFolderName = function(actual) {
		var browser = this;
		var width = $(actual).width() + 20;
		var height = $(actual).height() + 2;

		// Create the input text field
		if (width < 100)
			width = 150;
		actual.innerHTML = "<input id=\"" + actual.id + "_field\" style=\"width: " + width + "px; height: " + height + "px;\" maxlength=\"254\" type=\"text\" value=\"" + actual.innerHTML + "\"/>";

		// Attach the focus handler
		$(actual).find("input").focus(function() {
			$(this).select();
		});

		// Attach the keypress handler
		$(actual).find("input").keypress(function(event) {
			var objectId = $(actual).attr("id");
			browser._onFolderKeyPress(event, this, objectId);
		});

		// Attach the blur handler
		$(actual).find("input").blur(function(event) {
			var objectId = $(actual).attr("id");
			browser._onFolderBlur(event, this, objectId);
		});

		// Focus and select the text
		actual.firstChild.focus(function() {
			browser._onFolderKeyPress(this);
			$(this).select();
		});
	};

	/**
	 * View file handler
	 * 
	 * @elem: HTML element clicked
	 */
	Browser.prototype._onClickPreviewFile = function(icon) {
		var item = $(icon).closest(".menu-item");
		var name = $(item).find(".editText");
		var prop = $(item).find(".hiddenProperty");
		this._previewFile(name[0], prop[0]);
	},

	Browser.prototype._previewFile = function(actual, prop) {
		var uuid = prop.innerText.replace("workspace://SpacesStore/", "");
		var baseUrl = this.options.cmis.serverUrl.replace("/api/-default-/public/cmis/versions/1.1/browser", "");
		var previewUrl = baseUrl + "/service/api/node/workspace/SpacesStore/" + uuid + "/content/thumbnails/imgpreview?c=force";
		var downloadUrl = baseUrl + "/service/api/node/workspace/SpacesStore/" + uuid + "/content?a=false";

		var prvw = document.getElementById("previewpane");
		var prvwString = "";
		if (actual.innerHTML.indexOf("mp4") > 0) {
			prvwString = "<video controls><source src='" + downloadUrl + "' type='video/mp4' />Your browser does not support the video tag.</video>";
		} else if (actual.innerHTML.indexOf("mpg") > 0) {
			prvwString = "<video controls><source src='" + downloadUrl + "' type='video/mpg' />Your browser does not support the video tag.</video>";
		} else if (actual.innerHTML.indexOf("avi") > 0) {
			prvwString = "<video controls><source src='" + previewUrl + "' type='video/avi' />Your browser does not support the video tag.</video>";
		} else {
			prvwString = "<img src='" + previewUrl + "'/>";
		}
		prvwString += "<br/><a href='javascript:closePreview();'>Close Preview</a>"

		prvw.innerHTML = prvwString;
		prvw.style.visibility = "visible";
		prvw.style.display = "block";
		window.scrollTo(0, 0);
	},

	/**
	 * Download file handler
	 * 
	 * @elem: HTML element clicked
	 */
	Browser.prototype._onClickDownloadFile = function(icon) {
		var item = $(icon).closest(".menu-item");
		var name = $(item).find(".editText");
		var prop = $(item).find(".hiddenProperty");
		this._downloadFile(name[0], prop[0]);
	},

	Browser.prototype._downloadFile = function(actual, prop) {
		var uuid = prop.innerText.replace("workspace://SpacesStore/", "");
		var baseUrl = this.options.cmis.serverUrl.replace("/api/-default-/public/cmis/versions/1.1/browser", "");
		var downloadUrl = baseUrl + "/service/api/node/workspace/SpacesStore/" + uuid + "/content?a=false";
		// or use CMIS URL to reuse the existing login? this.options.cmis.token - or authorization header
		//var downloadUrl = this.options.cmis.serverUrl + "/root?objectId=" + uuid + "&cmisselector=content";
	    window.open(downloadUrl);
	},

	/**
	 * Key press event handler
	 * 
	 * @event: Event
	 * @field: Input text
	 * @objectId: Folder ID
	 */
	Browser.prototype._onFolderKeyPress = function(event, field, objectId) {
		var evt = (event) ? event : window.event;
		// If the user pressed enter
		if (evt.keyCode == 13 && field.value != "") {
			event.preventDefault();
			// We save the folder name
			this._onFolderUpdate(field, objectId);
			return false;
		} else {
			return true;
		}
	};

	/**
	 * Blur event handler
	 * 
	 * @event: Event
	 * @field: Input text
	 * @objectId: Folder ID
	 */
	Browser.prototype._onFolderBlur = function(event, field, objectId) {
		var elem = document.getElementById(objectId);
		// We replace the input field by the old name
		var oldName = field.attributes['value'].value;
		$(elem).html(oldName);
	};

	/**
	 * Update the folder's name in the repository
	 * 
	 * @field: Input text
	 * @objectId: Folder ID
	 */
	Browser.prototype._onFolderUpdate = function(field, objectId) {
		var session = this.options.cmis.session;
		var browser = this;
		var elem = document.getElementById(objectId);
		var objectId = elem.id.replace("/name", "");
		var newName = field.value;
		var oldName = field.attributes['value'].value;

		// Send a request to the repository
		session.updateProperties(objectId, {
			'cmis:name' : newName
		}, {
			request : {
				success : function(data) {
					// Replace the input field by the new name
					$(elem).html(newName);
					// Re-order sub-folders because of the renaming
					var parentId = $(elem).closest("ul").closest("li").find("div.menu-item.selected").attr("id");
					browser._reorderFolders($(elem).closest("ul"));
					// Send a broadcasting message
					browser._broadcastMessage("cmis-editFolder", parentId);
				},
				error : function(e) {
					// Display an error message
					browser._addError("Error during the update: " + e.responseJSON.message);
					$(elem).html(oldName);
					browser._reorderFolders($(elem).closest("ul"));
				}
			}
		});

		return false;
	};

	/**
	 * Reorder a list of child-folders
	 * 
	 * @ulElement: UL element of the parent item
	 */
	Browser.prototype._reorderFolders = function(ulElement) {
		var items = $(ulElement).find("li");
		items = items.sort(function(a, b) {
			var nameA = $(a).find(".label").html().toLowerCase();
			var nameB = $(b).find(".label").html().toLowerCase();
			if (nameA < nameB)
				return -1;
			else if (nameA > nameB)
				return 1;
			else
				return 0;
		});
		$(ulElement).append(items);
	}

	/**
	 * Add folder event handler
	 * 
	 * @icon: icon clicked
	 */
	Browser.prototype._onClickAddFolder = function(icon) {
		var item = $(icon).closest(".menu-item");
		var list = $(item).closest("li");
		// Get the parent ID
		var objectId = $(item).prop('id');
		var session = this.options.cmis.session;
		var browser = this;

		// Define the name of the new folder
		var folderName = "New Folder";
		var i = 1;
		while ($(list).find("div.label:contains('" + folderName + "')").length > 0) {
			folderName = "New Folder (" + i + ")";
			i++;
		}

		$(browser.element).find("#overlay").fadeIn(400, function() {
			// Create the folder with the default name
			session.createFolder($(item).prop('id'), folderName, null, null, null, {
				request : {
					success : function(data) {

						// Get the new folder Id
						var newFolderId = data.properties["cmis:objectId"].value;
						session.getObject(newFolderId, 'latest', {
							includeAllowableActions : true,
							request : {
								success : function(data) {
									$(browser.element).find("#overlay").fadeOut(400, function() {
										// Append the new item
										browser._appendItem($(list).find("ul:first"), data);
										// Edit the newly created folder
										$(browser.element).find(".menu-item[id='" + newFolderId + "']").find(".icon-edit[enabled='true']").click();
										// Send a broadcasting message
										browser._broadcastMessage("cmis-createFolder", objectId);
									});
								},
								error : function(e) {
									// Display error
									browser._addError("Can't get properties of " + newFolderId + ".");
									$(browser.element).find("#overlay").fadeOut();
								}
							}
						});
					},
					error : function(e) {
						// Display error
						browser._addError("Can't create new folder " + folderName + ".");
						$(browser.element).find("#overlay").fadeOut();
					}

				}
			});
		});
	};

	/**
	 * Displays an error message
	 * 
	 * @msg: Error message
	 */
	Browser.prototype._addError = function(msg) {
		var browser = this;
		// Add a new DIV element containing the error message
		var newElem = $(browser.element).find(".errors").append("<div class='error'>" + msg + "</div>");
		$(newElem).find(".error").click(function() {
			$(this).fadeOut(500, function() {
				$(this).remove();
			});
		});
	};

	/**
	 * Publish messages
	 */
	Browser.prototype._broadcastMessage = function(fn, data) {
		var browser = this;

		// Check if a component is registered
		if (!browser.useMessages)
			$(browser.register.cmis.components).each(function() {
				if (this.subscribe && this.subscribe[fn])
					this.subscribe[fn](data);
			});
		else
			// Send a broadcasting message
			parent.postMessage('{"name":"' + fn + '", "params":["' + data + '"]}', "*");
	}

	// Define the plugin
	$.fn[pluginName] = function(options) {
		return this.each(function() {
			if (!$.data(this, 'plugin_' + pluginName)) {
				$.data(this, 'plugin_' + pluginName, new Browser(this, options));
			}
		});
	}

})(jQuery, window, document);
