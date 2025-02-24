const separator = '➤';
const separatorHtml = `<span class='separator'>${separator}</span>`;

function _regexFromString(str, highlight) {
    var rxp = null;
    if (/^\/.+\/([gimuy]*)$/.test(str)) {
        // full regex input
        try {
            rxp = eval(str);
        } catch (e) {
            rxp = null;
        }
    }
    if (!rxp) {
        if (/^\/.+$/.test(str)) {
            // part regex input
            rxp = eval(str + "/i");
        }
        if (!rxp) {
            str = str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
            if (highlight) {
                rxp = new RegExp(str.replace(/\s+/, "\|"), 'gi');
            } else {
                var words = str.split(/\s+/).map(function(w) {
                    return `(?=.*${w})`;
                }).join('');
                rxp = new RegExp(`^${words}.*$`, "gi");
            }
        }
    }
    return rxp;
}

function _filterByTitleOrUrl(urls, query) {
    if (query && query.length) {
        var rxp = _regexFromString(query, false);
        urls = urls.filter(function(b) {
            return rxp.test(b.title) || rxp.test(b.url);
        });
    }
    return urls;
}

// DEBUG: Omnibar
/**
 * The omnibar provides kinds of functions that need user input, for example,
 *
 *  * Open url(from both bookmarks and history) with `t`
 *  * Open bookmarks with `b`
 *  * Open search engines with `og` / `ow` ...
 *  * Open commands with `:`
 *
 * Key bindings in Omnibar:
 *  * `Enter` to open selected item and close omnibar.
 *  * `Ctrl-Enter` to open selected item, but keep omnibar open for more items to be opened.
 *  * `Shift-Enter` to open selected item in current tab and close omnibar.
 *    If you'd like to open in current tab by default, please use go.
 *  * Tab to forward cycle through the candidates.
 *  * `Shift-Tab` to backward cycle through the candidates.
 *  * `Ctrl-`. to show results of next page
 *  * `Ctrl-`, to show results of previous page
 *  * `Ctrl-c` to copy all listed items
 *  * `Ctrl-e` to copy currently focussed item url
 *  * In omnibar opened with `t:`
 *
 * `Ctrl - d` to delete from bookmark or history
 *
 *  * In omnibar opened with `b:`
 *
 * `Ctrl - Shift - <any letter>` to create vim-like mark
 *
 * cmap could be used for Omnibar to change mappings, for example:
 *
 * ```js
 * cmap('<Ctrl-n>', '<Tab>');
 * cmap('<Ctrl-p>', '<Shift-Tab>');
 * ```
 * ---------
 *
 * @kind function
 *
 * @param {Object} mode
 * @return {Omnibar} Omnibar instance
 */
const Omnibar = (function() {
    var self = new Mode("Omnibar");

    self.addEventListener('keydown', function(event) {
        if (event.sk_keyName.length) {
            Mode.handleMapKey.call(self, event);
        }
        event.sk_suppressed = true;
    }).addEventListener('mousedown', function(event) {
        event.sk_suppressed = true;
    });

    self.mappings = new Trie();
    self.map_node = self.mappings;

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-d>"), {
        annotation: "Delete focused item from bookmark or history",
        feature_group: 8,
        code: function () {
            var fi = Omnibar.resultsDiv.querySelector('li.focused');
            if (fi && fi.uid) {
                RUNTIME("removeURL", {
                    uid: fi.uid
                }, function(ret) {
                    if (ret.response === "Done") {
                        fi.remove();
                    }
                });
            }
        }
    });

    function reopen(handler) {
        Front.hidePopup();
        setTimeout(handler, 100);
    }

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-i>"), {
        annotation: "Edit selected URL with vim editor, then open",
        feature_group: 8,
        code: function () {
            var fi = Omnibar.resultsDiv.querySelector('li.focused');
            if (fi && fi.url) {
                reopen(function () {
                    Front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: fi.url,
                        onEditorSaved: function(data) {
                            data && tabOpenLink(data);
                        }
                    });
                });
            } else if (handler === SearchEngine) {
                var query = Omnibar.input.value;
                var url = SearchEngine.url;
                reopen(function () {
                    Front.showEditor({
                        initial_line: 1,
                        type: "url",
                        content: query,
                        onEditorSaved: function(data) {
                            tabOpenLink(constructSearchURL(url, encodeURIComponent(data)));
                        }
                    });
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-j>"), {
        annotation: "Toggle Omnibar's position",
        feature_group: 8,
        code: function () {
            if (runtime.conf.omnibarPosition === "bottom") {
                runtime.conf.omnibarPosition = "middle";
            } else {
                runtime.conf.omnibarPosition = "bottom";
            }
            reopen(function() {
                _savedAargs.pref = self.input.value;
                Front.openOmnibar(_savedAargs);
            });
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-.>"), {
        annotation: "Show results of next page",
        feature_group: 8,
        code: function () {
            if (_items) {
                if (_start * _pageSize < _items.length) {
                    _start ++;
                } else {
                    _start = 1;
                }
                _listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-,>"), {
        annotation: "Show results of previous page",
        feature_group: 8,
        code: function () {
            if (_items) {
                if (_start > 1) {
                    _start --;
                } else {
                    _start = Math.ceil(_items.length / _pageSize);
                }
                _listResultPage();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-c>"), {
        annotation: "Copy selected item url or all listed item urls",
        feature_group: 8,
        code: function () {
            // hide Omnibar.input, so that we could use clipboard_holder to make copy
            self.input.style.display = "none";

            const fi = Omnibar.resultsDiv.querySelector('li.focused');
            const url = (fi && fi.url) ? fi.url : _page.map(p => {
                return p.url;
            }).join("\n");
            Clipboard.write(url);

            self.input.style.display = "";
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-D>"), {
        annotation: "Delete all listed items from bookmark or history",
        feature_group: 8,
        code: function () {
            var uids = Array.from(Omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li')).map(function(li) {
                return li.uid;
            }).filter(function(u) {
                return u;
            });
            if (uids.length) {
                RUNTIME("removeURL", {
                    uid: uids
                }, function(ret) {
                    if (ret.response === "Done") {
                        if (handler && handler.getResults) {
                            handler.getResults();
                        }
                        Omnibar.triggerInput();
                    }
                });
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-r>"), {
        annotation: "Re-sort history by visitCount or lastVisitTime",
        feature_group: 8,
        code: function () {
            if (handler && handler.onReset) {
                handler.onReset();
            }
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Esc>"), {
        annotation: "Close Omnibar",
        feature_group: 8,
        code: function () {
            Front.hidePopup();
        }
    });

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-m>"), {
        annotation: "Create vim-like mark for selected item",
        feature_group: 8,
        code: function (mark) {
            var fi = Omnibar.resultsDiv.querySelector('li.focused');
            if (fi) {
                Normal.addVIMark(mark, fi.url);
            }
        }
    });

    var handlers = {},
        bookmarkFolders;

    var lastInput = "", handler, lastHandler = null;
    // DEBUG: Front.omnibar
    var ui = Front.omnibar;
    ui.onclick = function(e) {
        if (handler.onClick) {
            handler.onClick(e);
        } else {
            self.input.focus();
        }
    };

    self.triggerInput = function() {
        var event = new Event('input', {
            'bubbles': true,
            'cancelable': true
        });
        self.input.dispatchEvent(event);
    };

    self.expandAlias = function(alias, val) {
        var eaten = false;
        if (handler !== SearchEngine && alias.length && SearchEngine.aliases.hasOwnProperty(alias)) {
            lastHandler = handler;
            handler = SearchEngine;
            Object.assign(SearchEngine, SearchEngine.aliases[alias]);
            setSanitizedContent(self.resultsDiv, "");
            setSanitizedContent(self.promptSpan, handler.prompt);
            setSanitizedContent(resultPageSpan, "");
            _items = null;
            self.collapsingPoint = val;
            self.input.value = val;
            if (val.length) {
                Omnibar.triggerInput();
            }
            eaten = true;
        }
        return eaten;
    };

    self.collapseAlias = function() {
        var eaten = false, val = self.input.value;
        if (lastHandler && handler !== lastHandler && (val === self.collapsingPoint || val === "")) {
            handler = lastHandler;
            lastHandler = null;
            setSanitizedContent(self.promptSpan, handler.prompt);
            if (val.length) {
                self.input.value = val.substr(0, val.length - 1);
            }
            Omnibar.triggerInput();
            eaten = true;
        }
        return eaten;
    };

    self.focusItem = function(fi) {
        if (typeof(fi) === 'string') {
            fi = self.resultsDiv.querySelector(fi);
        }
        fi.classList.add('focused');
        scrollIntoViewIfNeeded(fi);
    };

    function rotateResult(backward) {
        var items = Array.from(self.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li'));
        var total = items.length;
        if (total > 0) {
            var fi = self.resultsDiv.querySelector('li.focused');
            if (fi) {
                fi.classList.remove('focused');
            }
            var lastFocused = items.indexOf(fi);
            lastFocused = (lastFocused === -1) ? total : lastFocused;
            var toFocus = (backward ? (lastFocused + total) : (lastFocused + total + 2)) % (total + 1);
            if (toFocus < total) {
                Omnibar.focusItem(items[toFocus]);
                handler.onTabKey && handler.onTabKey();
            } else {
                self.input.value = lastInput;
            }
        }
    }

    self.promptSpan = ui.querySelector('#sk_omnibarSearchArea>span.prompt');
    var resultPageSpan = ui.querySelector('#sk_omnibarSearchArea>span.resultPage');
    self.resultsDiv = ui.querySelector('#sk_omnibarSearchResult');

    function _onIput() {
        if (lastInput !== self.input.value) {
            lastInput = self.input.value;
        }
        handler.onInput && handler.onInput.call(this);
    }
    function _onKeyDown(evt) {
        if (handler && handler.onKeydown) {
            handler.onKeydown.call(evt.target, evt) && evt.preventDefault();
        }
        if (Mode.isSpecialKeyOf("<Esc>", evt.sk_keyName)) {
            Front.hidePopup();
            evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.enter) {
            handler.activeTab = !evt.ctrlKey;
            handler.tabbed = Omnibar.tabbed ^ evt.shiftKey;
            handler.onEnter() && Front.hidePopup();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.space) {
            self.expandAlias(self.input.value, '') && evt.preventDefault();
        } else if (evt.keyCode === KeyboardUtils.keyCodes.backspace) {
            self.collapseAlias() && evt.preventDefault();
        }
    }
    function _createInput() {
        var _input = document.createElement("input");
        _input.oninput = _onIput;
        _input.onkeydown = _onKeyDown;
        _input.addEventListener('compositionstart', function(evt) {
            _input.oninput = null;
            _input.onkeydown = null;
        });
        _input.addEventListener('compositionend', function(evt) {
            _input.oninput = _onIput;
            _input.onkeydown = _onKeyDown;
            _onIput();
        });
        return _input;
    }

    self.mappings.add(KeyboardUtils.encodeKeystroke("<Tab>"), {
        annotation: "Forward cycle through the candidates.",
        feature_group: 8,
        code: function () {
            rotateResult(runtime.conf.omnibarPosition === "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Shift-Tab>"), {
        annotation: "Backward cycle through the candidates.",
        feature_group: 8,
        code: function () {
            rotateResult(runtime.conf.omnibarPosition !== "bottom");
        }
    });
    self.mappings.add(KeyboardUtils.encodeKeystroke("<Ctrl-'>"), {
        annotation: "Toggle quotes in an input element",
        feature_group: 8,
        code: toggleQuote
    });

    self.highlight = function(rxp, str) {
        if (str.substr(0, 11) === "data:image/") {
            str = str.substr(0, 1024);
        }
        return (rxp === null) ? str : str.replace(rxp, function(m) {
            return "<span class=omnibar_highlight>" + m + "</span>";
        });
    };

    self.createURLItem = function(b, rxp) {
        b.title = (b.title && b.title !== "") ? b.title : b.url;
        var type = "🔥", additional = "", uid = b.uid;
        if (b.hasOwnProperty('lastVisitTime')) {
            type = "🕜";
            additional = `<span class=omnibar_timestamp># ${timeStampString(b.lastVisitTime)}</span>`;
            additional += `<span class=omnibar_visitcount> (${b.visitCount})</span>`;
            uid = "H" + b.url;
        } else if(b.hasOwnProperty('dateAdded')) {
            type = "⭐";
            additional = `<span class=omnibar_folder>@ ${bookmarkFolders[b.parentId].title || ""}</span> <span class=omnibar_timestamp># ${timeStampString(b.dateAdded)}</span>`;
            uid = "B" + b.id;
        } else if(b.hasOwnProperty('width')) {
            type = "🔖";
            uid = "T" + b.windowId + ":" + b.id;
        // } else if(b.type && /^\p{Emoji}$/u.test(b.type)) {
        } else if(b.type && b.type.length === 2 && b.type.charCodeAt(0) > 255) {
            type = b.type;
        }
        var li = createElementWithContent('li',
            `<div class="title">${type} ${self.highlight(rxp, htmlEncode(b.title))} ${additional}</div><div class="url">${self.highlight(rxp, b.url)}</div>`);
        li.uid = uid;
        li.url = b.url;
        return li;
    };

    self.createItemFromRawHtml = function({ html, props }) {
        const li = createElementWithContent('li', html);
        if (typeof props === "object") {
            Object.assign(li, props);
        }
        return li;
    };

    self.detectAndInsertURLItem = function(str, toList) {
        var urlPat = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n\s]+)\.([^:\/\n\s]+)/i,
            urlPat1 = /^https?:\/\/(?:[^@\/\n]+@)?([^:\/\n\s]+)/i;
        if (urlPat.test(str)) {
            var url = str;
            if (! /^https?:\/\//.test(str)) {
                url = "http://" + str;
            }
            toList.unshift({
                title: str,
                url: url
            });
        } else if (urlPat1.test(str)) {
            toList.unshift({
                title: str,
                url: str
            });
        }
    };

    var _start, _items, _showFolder, _pageSize, _page;

    /**
     * List URLs like {url: "https://github.com", title: "github.com"} beneath omnibar
     *
     * @example
     *
     * Omnibar.listURLs ([{url: 'http://google.com', title: 'Google'}], false)
     *
     * @memberof Omnibar
     * @instance
     *
     * @param {Array} items - Array of url items with title.
     * @param {boolean} showFolder - True to show a item as folder if it has no property url.
     *
     * @return {undefined}
     */
    self.listURLs = function(items, showFolder) {
        _pageSize = (runtime.conf.omnibarMaxResults || 10);
        _start = 1;
        _items = items;
        _showFolder = showFolder;
        _listResultPage();
    };
    self.getItems = function() {
        return _items;
    };

    function _listResultPage() {
        var si = (_start - 1) * _pageSize,
            ei = si + _pageSize;
            ei = ei > _items.length ? _items.length : ei;
        setSanitizedContent(resultPageSpan, `${si + 1} - ${ei} / ${_items.length}`);
        _page = _items.slice(si, ei);
        var query = self.input.value.trim();
        var rxp = null;
        if (query.length) {
            rxp = _regexFromString(query, true);
        }
        self.listResults(_page, function(b) {
            var li;
            if (b.hasOwnProperty('html')) {
                li = self.createItemFromRawHtml(b);
            } else if (b.hasOwnProperty('url') && b.url !== undefined) {
                if (window.navigator.userAgent.indexOf("Firefox") !== -1 && /^(place|data):/i.test(b.url)) {
                    return null;
                }
                li = self.createURLItem(b, rxp);
            } else if (_showFolder) {
                li = createElementWithContent('li', `<div class="title">▷ ${self.highlight(rxp, b.title)}</div>`);
                li.folder_name = b.title;
                li.folderId = b.id;
            }
            return li;
        });
    }

    var _savedAargs;
    ui.onShow = function(args) {
        if (!self.input) {
            self.input = _createInput();
            document.querySelector("#sk_omnibarSearchArea").insertBefore(self.input, resultPageSpan);
        }
        _savedAargs = args;
        ui.classList.remove("sk_omnibar_middle");
        ui.classList.remove("sk_omnibar_bottom");
        ui.classList.add("sk_omnibar_" + runtime.conf.omnibarPosition);
        if (runtime.conf.omnibarPosition === "bottom") {
            self.resultsDiv.remove();
            ui.insertBefore(self.resultsDiv, document.querySelector("#sk_omnibarSearchArea"));
        } else {
            self.resultsDiv.remove();
            ui.append(self.resultsDiv);
        }

        self.tabbed = (args.tabbed !== undefined) ? args.tabbed : true;
        handler = handlers[args.type];
        self.input.focus();
        self.enter();
        if (args.pref) {
            self.input.value = args.pref;
        }
        handler.onOpen && handler.onOpen(args.extra);
        lastHandler = handler;
        handler = handler;
        setSanitizedContent(self.promptSpan, handler.prompt);
        setSanitizedContent(resultPageSpan, "");
        ui.scrollTop = 0;
    };

    ui.onHide = function() {
        // clear cache
        delete self.cachedPromise;
        // delete only deletes properties of an object and
        // cannot normally delete a variable declared using var, whatever the scope.
        _items = null;
        bookmarkFolders = null;

        lastInput = "";
        self.input.value = "";
        self.input.placeholder = "";
        setSanitizedContent(self.resultsDiv, "");
        lastHandler = null;
        handler.onClose && handler.onClose();
        self.exit();
        handler = null;
    };

    self.openFocused = function() {
        var ret = false, fi = self.resultsDiv.querySelector('li.focused');
        var url;
        if (fi) {
            url = fi.url;
        } else {
            url = self.input.value;
            if (url.indexOf(':') === -1) {
                url = SearchEngine.aliases[runtime.conf.defaultSearchEngine].url + url;
            }
        }
        var type = "", uid;
        if (fi && fi.uid) {
            uid = fi.uid;
            type = uid[0], uid = uid.substr(1);
        }
        if (type === 'T') {
            uid = uid.split(":");
            RUNTIME('focusTab', {
                windowId: parseInt(uid[0]),
                tabId: parseInt(uid[1])
            });
        } else if (url && url.length) {
            RUNTIME("openLink", {
                tab: {
                    tabbed: this.tabbed,
                    active: this.activeTab
                },
                url: url
            });
        }
        return this.activeTab;
    };

    self.listResults = function (items, renderItem) {
        setSanitizedContent(self.resultsDiv, "");
        if (!items || items.length === 0) {
            return;
        }
        if (runtime.conf.omnibarPosition === "bottom") {
            items.reverse();
        }
        var ul = document.createElement("ul");
        items.forEach(function(b) {
            var li = renderItem(b);
            if (li) {
                ul.append(li);
            }
        });
        self.resultsDiv.append(ul);
        items = self.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li");
        if (runtime.conf.focusFirstCandidate || handler.focusFirstCandidate) {
            var fi = (runtime.conf.omnibarPosition === "bottom") ? items.length - 1 : 0;
            items[fi].classList.add('focused');
        }
        if (runtime.conf.omnibarPosition === "bottom" && items.length > 0) {
            scrollIntoViewIfNeeded(items[items.length-1]);
        }
    };

    self.listWords = function(words) {
        self.listResults(words, function(w) {
            var li = createElementWithContent('li', `⌕ ${w}`);
            li.query = w;
            return li;
        });
    };

    self.html = function(content) {
        setSanitizedContent(self.resultsDiv, content);
    };

    self.addHandler = function(name, hdl) {
        handlers[name] = hdl;
    };

    self.listBookmarkFolders = function(cb) {
        RUNTIME('getBookmarkFolders', null, function(response) {
            bookmarkFolders = {};
            response.folders.forEach(function(f) {
                bookmarkFolders[f.id] = f;
            });
            cb && cb(response, bookmarkFolders);
        });
    };

    return self;
})();

const OpenBookmarks = (function() {
    var self = {
        prompt: `bookmark${separatorHtml}`,
        inFolder: []
    };

    var folderOnly = false,
        currentFolderId,
        lastFocused = 0;

    function onFolderUp() {
        var fl = self.inFolder.pop();
        if (fl.folderId) {
            currentFolderId = fl.folderId;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, self.onResponse);
        } else {
            currentFolderId = undefined;
            RUNTIME('getBookmarks', null, self.onResponse);
        }
        self.prompt = fl.prompt;
        setSanitizedContent(Omnibar.promptSpan, self.prompt);
        lastFocused = fl.focused;
    }

    self.onEnter = function() {
        var items = Array.from(Omnibar.resultsDiv.querySelectorAll("#sk_omnibarSearchResult>ul>li"));
        var ret = false,
            fi = Omnibar.resultsDiv.querySelector('li.focused');
        var folderId = fi.folderId;
        if (folderId) {
            self.inFolder.push({
                prompt: self.prompt,
                folderId: currentFolderId,
                focused: items.indexOf(fi)
            });
            self.prompt = fi.folder_name + separator;
            setSanitizedContent(Omnibar.promptSpan, self.prompt);
            Omnibar.input.value = "";
            currentFolderId = folderId;
            lastFocused = 0;
            RUNTIME('getBookmarks', {
                parentId: currentFolderId
            }, OpenBookmarks.onResponse);
        } else {
            ret = Omnibar.openFocused.call(self);
            if (ret) {
                self.inFolder.push({
                    prompt: self.prompt,
                    folderId: currentFolderId,
                    focused: items.indexOf(fi)
                });
                localStorage.setItem("surfingkeys.lastOpenBookmark", JSON.stringify(self.inFolder));
            }
        }
        return ret;
    };

    self.onOpen = function() {
        Omnibar.listBookmarkFolders(function() {
            var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastOpenBookmark");
            if (lastBookmarkFolder) {
                self.inFolder = JSON.parse(lastBookmarkFolder);
                onFolderUp();
            } else {
                RUNTIME('getBookmarks', null, self.onResponse);
            }
            if (Omnibar.input.value !== "") {
                self.onInput();
            }
        });
    };

    self.onClose = function() {
        self.inFolder = [];
        self.prompt = `bookmark${separatorHtml}`;
        currentFolderId = undefined;
    };

    self.onKeydown = function(event) {
        var eaten = false;
        if (event.keyCode === KeyboardUtils.keyCodes.comma) {
            folderOnly = !folderOnly;
            self.prompt = folderOnly ? `bookmark folder${separator}` : `bookmark${separator}`;
            setSanitizedContent(Omnibar.promptSpan, self.prompt);
            RUNTIME('getBookmarks', {
                parentId: currentFolderId,
                query: Omnibar.input.value
            }, self.onResponse);
            eaten = true;
        } else if (event.keyCode === KeyboardUtils.keyCodes.backspace && self.inFolder.length && !Omnibar.input.value.length) {
            onFolderUp();
            eaten = true;
        } else if (event.ctrlKey && event.shiftKey && KeyboardUtils.isWordChar(event)) {
            var fi = Omnibar.resultsDiv.querySelector('li.focused');
            if (fi) {
                var mark_char = String.fromCharCode(event.keyCode);
                Normal.addVIMark(mark_char, fi.url);
                eaten = true;
            }
        }
        return eaten;
    };
    self.onInput = function() {
        var query = Omnibar.input.value;
        RUNTIME('getBookmarks', {
            parentId: currentFolderId,
            caseSensitive: runtime.getCaseSensitive(query),
            query
        }, self.onResponse);
    };
    self.onResponse = function(response) {
        var items = response.bookmarks;
        if (folderOnly) {
            items = items.filter(function(b) {
                return !b.hasOwnProperty('url') || b.url === undefined;
            });
        }
        Omnibar.listURLs(items, true);

        var items = Omnibar.resultsDiv.querySelectorAll('#sk_omnibarSearchResult>ul>li');
        Omnibar.focusItem(items[lastFocused]);
    };

    return self;
})();
Omnibar.addHandler('Bookmarks', OpenBookmarks);

const AddBookmark = (function() {
    var self = {
        focusFirstCandidate: true,
        prompt: `add bookmark${separatorHtml}`
    }, folders, origFFC;

    self.onOpen = function(arg) {
        self.page = arg;
        Omnibar.listBookmarkFolders(function(response) {
            folders = response.folders;
            Omnibar.listResults(folders.slice(), function(f) {
                return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
            });
            RUNTIME("getBookmark", null, function(resp) {
                if (resp.bookmarks.length) {
                    var b = resp.bookmarks[0];
                    setSanitizedContent(Omnibar.promptSpan, `edit bookmark${separatorHtml}`);
                    Omnibar.resultsDiv.querySelector('li.focused').classList.remove('focused');
                    Omnibar.focusItem(`li[folder="${b.parentId}"]`);
                }

                //restore the last used bookmark folder input
                var lastBookmarkFolder = localStorage.getItem("surfingkeys.lastAddedBookmark");
                if (lastBookmarkFolder) {
                    Omnibar.input.value = lastBookmarkFolder;

                    //make the input selected, so if user don't want to use it,
                    //just input to overwrite the previous value
                    Omnibar.input.select();

                    // trigger omnibar input matching
                    self.onInput();
                }
            });
        });
    };

    self.onTabKey = function() {
        var fi = Omnibar.resultsDiv.querySelector('li.focused');
        Omnibar.input.value = fi.innerHTML.substr(2);
    };

    self.onEnter = function() {
        self.page.path = [];
        var fi = Omnibar.resultsDiv.querySelector('li.focused');
        var folderName;
        if (fi) {
            self.page.folder = fi.getAttribute('folder');
            folderName = fi.innerHTML.substr(2);
        } else {
            var path = Omnibar.input.value;
            path = path.split('/');
            var title = path.pop();
            if (title.length) {
                self.page.title = title;
            }
            path = path.filter(function(p) {
                return p.length > 0;
            });
            for (var l = path.length; l > 0; l--) {
                var targetFolder = folders.filter(function(f) {
                    return f.title === `/${path.slice(0, l).join("/")}/`;
                });
                if (targetFolder.length) {
                    self.page.folder = targetFolder[0].id;
                    self.page.path = path.slice(l);
                    folderName = "/" + path.join("/");
                    break;
                }
            }
            if (self.page.folder === undefined) {
                self.page.folder = folders[0].id;
                self.page.path = path;
                folderName = `${folders[0].title}${path.join("/")}`;
            }
        }
        RUNTIME('createBookmark', {
            page: self.page
        }, function(response) {
            Front.showBanner("Bookmark created at {0}.".format(folderName), 3000);
        });
        localStorage.setItem("surfingkeys.lastAddedBookmark", Omnibar.input.value);
        return true;
    };

    self.onInput = function() {
        var query = Omnibar.input.value;
        var caseSensitive = runtime.getCaseSensitive(query);
        var matches = folders.filter(function(b) {
            if (caseSensitive)
              return b.title.indexOf(query) !== -1;
            else
              return b.title.toLowerCase().indexOf(query.toLowerCase()) !== -1;
        });
        Omnibar.listResults(matches, function(f) {
            return createElementWithContent('li', `▷ ${f.title}`, {folder: f.id});
        });
    };

    return self;
})();
Omnibar.addHandler('AddBookmark', AddBookmark);

const OpenHistory = (function() {
    var self = {
        prompt: `history${separatorHtml}`
    };

    self.onOpen = function(arg) {
        self.getResults();
        self.onInput();
    };

    self.getResults = function() {
        Omnibar.cachedPromise = new Promise(function(resolve, reject) {
            RUNTIME('getHistory', {
                sortByMostUsed: runtime.conf.historyMUOrder
            }, function(response) {
                resolve(response.history);
            });
        });
    };

    self.onReset = function() {
        runtime.conf.historyMUOrder = !runtime.conf.historyMUOrder;
        Omnibar.cachedPromise.then(function(cached) {
            if (runtime.conf.historyMUOrder) {
                cached = cached.sort(function(a, b) {
                    return b.visitCount - a.visitCount;
                });
            } else {
                cached = cached.sort(function(a, b) {
                    return b.lastVisitTime - a.lastVisitTime;
                });
            }
            var filtered = _filterByTitleOrUrl(cached, Omnibar.input.value);
            Omnibar.listURLs(filtered, false);
        });
    };

    self.onEnter = Omnibar.openFocused.bind(self);
    self.onInput = function() {
        Omnibar.cachedPromise.then(function(cached) {
            var filtered = _filterByTitleOrUrl(cached, Omnibar.input.value);
            Omnibar.listURLs(filtered, false);
        });
    };
    return self;
})();
Omnibar.addHandler('History', OpenHistory);

const OpenURLs = (function() {
    var self = {
        prompt: `${separatorHtml}`
    };

    self.getResults = function() {
        if (self.action === "getAllSites") {
            Omnibar.cachedPromise = new Promise(function(resolve, reject) {
                RUNTIME('getTabs', {
                    queryInfo: runtime.conf.omnibarTabsQuery
                }, function(response) {
                    var cached = response.tabs;
                    RUNTIME("getTopSites", null, function(response) {
                        cached = cached.concat(response.urls);
                        Omnibar.listBookmarkFolders(function() {
                            RUNTIME('getAllURLs', null, function(response) {
                                cached = cached.concat(response.urls);
                                resolve(cached);
                            });
                        });
                    });
                });
            });
        } else {
            Omnibar.cachedPromise = new Promise(function(resolve, reject) {
                RUNTIME(self.action, null, function(response) {
                    resolve(response.urls);
                });
            });
        }
    };

    self.onOpen = function(arg) {
        self.action = arg;
        if (self.action === "getRecentlyClosed") {
            self.prompt = `Recently closed${separatorHtml}`;
        } else if (self.action === "getTabURLs") {
            self.prompt = `Tab History${separatorHtml}`;
        } else {
            self.prompt = `${separatorHtml}`;
        }
        self.getResults();
        self.onInput();
    };
    self.onEnter = Omnibar.openFocused.bind(self);
    self.onInput = function() {
        Omnibar.cachedPromise.then(function(cached) {
            var val = Omnibar.input.value;
            var filtered = _filterByTitleOrUrl(cached, val);
            if (filtered.length === 0) {
                Omnibar.expandAlias(runtime.conf.defaultSearchEngine, val);
            } else {
                Omnibar.detectAndInsertURLItem(val, filtered);
                Omnibar.listURLs(filtered, false);
            }
        });
    };
    return self;
})();
Omnibar.addHandler('URLs', OpenURLs);

const OpenTabs = (function() {
    var self = {
        focusFirstCandidate: true,
    };

    var queryInfo = {};
    self.getResults = function () {
        Omnibar.cachedPromise = new Promise(function(resolve, reject) {
            RUNTIME('getTabs', queryInfo, function(response) {
                resolve(response.tabs);
            });
        });
    };
    self.onOpen = function(args) {
        if (args && args.action === "gather") {
            self.prompt = `Gather filtered tabs into current window${separatorHtml}`;
            self.onEnter = function() {
                RUNTIME('gatherTabs', {
                    tabs: Omnibar.getItems()
                });
                return true;
            };
            queryInfo = {queryInfo: {currentWindow: false}};
        } else {
            self.prompt = `tabs${separatorHtml}`;
            self.onEnter = Omnibar.openFocused.bind(self);
            queryInfo = {};
        }
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        Omnibar.cachedPromise.then(function(cached) {
            var filtered = _filterByTitleOrUrl(cached, Omnibar.input.value);
            Omnibar.listURLs(filtered, false);
        });
    };
    return self;
})();
Omnibar.addHandler('Tabs', OpenTabs);

const OpenWindows = (function() {
    const self = {
        prompt: `Move current tab to window${separatorHtml}`
    };

    self.getResults = function () {
        Omnibar.cachedPromise = new Promise(function(resolve, reject) {
            RUNTIME('getWindows', {
                query: ''
            }, function(response) {
                resolve(response.windows);
            });
        });
    };
    self.onEnter = function() {
        const fi = Omnibar.resultsDiv.querySelector('li.focused');
        let windowId = -1;
        if (fi && fi.windowId !== undefined) {
            windowId = fi.windowId;
        }
        RUNTIME('moveToWindow', { windowId });
        return true;
    };
    self.onOpen = function() {
        Omnibar.input.placeholder = "Press enter without focusing an item to move to a new window.";
        self.getResults();
        self.onInput();
    };
    self.onInput = function() {
        Omnibar.cachedPromise.then(function(cached) {
            if (cached.length === 0) {
                RUNTIME('moveToWindow', { windowId: -1 });
                Front.hidePopup();
            }
            let filtered = cached;
            const query = Omnibar.input.value;
            let rxp = null;
            if (query && query.length) {
                rxp = _regexFromString(query, false);
                filtered = cached.filter(function(w) {
                    for (const t of w.tabs) {
                        if (rxp.test(t.title) || rxp.test(t.url)) {
                            return true;
                        }
                    }
                    return false;
                });
            }
            rxp = _regexFromString(query, true);
            Omnibar.listResults(filtered, function(w) {
                const li = createElementWithContent('li');
                li.windowId = parseInt(w.id);
                li.classList.add('window');
                if (w.isPreviousChoice) {
                    li.classList.add('focused');
                }
                w.tabs.forEach(t => {
                    const div = createElementWithContent('div', '', {class: "tab_in_window"});
                    div.appendChild(createElementWithContent('div', Omnibar.highlight(rxp, t.title), {class: "title"}));
                    div.appendChild(createElementWithContent('div', Omnibar.highlight(rxp, new URL(t.url).origin), {class: "url"}));
                    li.appendChild(div);
                });
                // set url so that we can copy all URls of tabs in this window.
                li.url = w.tabs.map(t => {
                    return t.url;
                }).join("\n");
                return li;
            });
        });
    };
    return self;
})();
Omnibar.addHandler('Windows', OpenWindows);

const OpenVIMarks = (function() {
    var self = {
        focusFirstCandidate: true,
        prompt: `VIMarks${separatorHtml}`
    };

    self.onOpen = function() {
        var query = Omnibar.input.value;
        var urls = [];
        RUNTIME('getSettings', {
            key: 'marks'
        }, function(response) {
            for (var m in response.settings.marks) {
                var markInfo = response.settings.marks[m];
                if (typeof(markInfo) === "string") {
                    markInfo = {
                        url: markInfo,
                        scrollLeft: 0,
                        scrollTop: 0
                    };
                }
                if (query === "" || markInfo.url.indexOf(query) !== -1) {
                    urls.push({
                        title: m,
                        type: '🔗',
                        uid: 'M' + m,
                        url: markInfo.url
                    });
                }
            }
            Omnibar.listURLs(urls, false);
        });
    };
    self.onEnter = Omnibar.openFocused.bind(self);
    self.onInput = self.onOpen;
    return self;
})();
Omnibar.addHandler('VIMarks', OpenVIMarks);

const SearchEngine = (function() {
    var self = {};
    self.aliases = {};

    var _pendingRequest = undefined; // timeout ID
    function clearPendingRequest() {
        if (_pendingRequest) {
            clearTimeout(_pendingRequest);
            _pendingRequest = undefined;
        }
    }

    function formatURL(url, query) {
        if (url.indexOf("%s") !== -1) {
            return url.replace("%s", query);
        }
        return url + query;
    }

    self.onOpen = function(arg) {
        Object.assign(self, self.aliases[arg]);
        var q = Omnibar.input.value;
        if (q.length) {
            var b = q.match(/^(site:\S+\s*).*/);
            if (b) {
                Omnibar.input.setSelectionRange(b[1].length, q.length);
            }
            Omnibar.triggerInput();
        }
    };
    self.onClose = function() {
        clearPendingRequest();
        self.prompt = undefined;
        self.url = undefined;
        self.suggestionURL = undefined;
    };
    self.onTabKey = function() {
        var fi = Omnibar.resultsDiv.querySelector('li.focused');
        if (fi && fi.query) {
            Omnibar.input.value = fi.query;
        }
    };
    self.onEnter = function() {
        var fi = Omnibar.resultsDiv.querySelector('li.focused'), url;
        if (fi) {
            url = fi.url || constructSearchURL(self.url, (fi.query || encodeURIComponent(Omnibar.input.value)));
        } else {
            url = constructSearchURL(self.url, encodeURIComponent(Omnibar.input.value));
        }
        RUNTIME("openLink", {
            tab: {
                tabbed: this.tabbed,
                active: this.activeTab
            },
            url: url
        });
        return this.activeTab;
    };
    function listSuggestions(suggestions) {
        Omnibar.detectAndInsertURLItem(Omnibar.input.value, suggestions);
        var rxp = _regexFromString(encodeURIComponent(Omnibar.input.value), true);
        Omnibar.listResults(suggestions, function (w) {
            if (w.hasOwnProperty('html')) {
                return Omnibar.createItemFromRawHtml(w);
            } else if (w.hasOwnProperty('url')) {
                return Omnibar.createURLItem(w, rxp);
            } else {
                var li = createElementWithContent('li', `⌕ ${w}`);
                li.query = w;
                return li;
            }
        });
    }
    self.onInput = function () {
        var canSuggest = self.suggestionURL;
        var showSuggestions = canSuggest && runtime.conf.omnibarSuggestion;

        if (!showSuggestions) {
            listSuggestions([]);
            return;
        }

        clearPendingRequest();
        // Set a timeout before the request is dispatched so that it can be canceled if necessary.
        // This helps prevent rate-limits when typing a long query.
        // E.g. github.com's API rate-limits after only 10 unauthenticated requests.
        _pendingRequest = setTimeout(function() {
            RUNTIME('request', {
                method: 'get',
                url: formatURL(self.suggestionURL, encodeURIComponent(Omnibar.input.value))
            }, function (resp) {
                Front.contentCommand({
                    action: 'getSearchSuggestions',
                    url: self.suggestionURL,
                    response: resp
                }, function(resp) {
                    resp = resp.data;
                    if (!Array.isArray(resp)) {
                        resp = [];
                    }
                    listSuggestions(resp);
                });
            });
        }, runtime.conf.omnibarSuggestionTimeout);
    };
    return self;
})();
Omnibar.addHandler('SearchEngine', SearchEngine);

const Commands = (function() {
    var self = {
        focusFirstCandidate: true,
        prompt: ':',
        items: {}
    };

    var historyInc = 0;

    /**
     * List commands when OmniBar opens
     *
     * @memberof Omnibar
     * @instance
     *
     * @return {undefined}
     */
    self.onOpen = function() {
        historyInc = -1;
        RUNTIME('getSettings', {
            key: 'cmdHistory'
        }, function(response) {
            var candidates = response.settings.cmdHistory;
            if (candidates.length) {
                Omnibar.listResults(candidates, function(c) {
                    var li = createElementWithContent('li', c);
                    li.cmd = c;
                    return li;
                });
            }
        });
    };

    self.onReset = self.onOpen;

    self.onInput = function() {
        var cmd = Omnibar.input.value;
        var candidates = Object.keys(self.items).filter(function(c) {
            return cmd === "" || c.indexOf(cmd) !== -1;
        });
        if (candidates.length) {
            Omnibar.listResults(candidates, function(c) {
                var li = createElementWithContent('li', `${c}<span class=annotation>${htmlEncode(self.items[c].annotation)}</span>`);
                li.cmd = c;
                return li;
            });
        }
    };

    self.onTabKey = function() {
        Omnibar.input.value = Omnibar.resultsDiv.querySelector('li.focused').cmd;
    };

    /**
     * Execute command after pressing the return key.
     *
     * Displays any output if the command.
     *
     * @memberof Omnibar
     * @instance
     *
     * @returns {boolean}
     */
    self.onEnter = function() {
        var ret = false;
        var cmdline = Omnibar.input.value;
        if (cmdline.length) {
            runtime.updateHistory('cmd', cmdline);
            self.execute(cmdline);
            Omnibar.input.value = "";
        }
        return ret;
    };

    function parseCommand(cmdline) {
        var cmdline = cmdline.trim();
        var tokens = [];
        var pendingToken = false;
        var part = '';
        for (var i = 0; i < cmdline.length; i++) {
            if (cmdline.charAt(i) === ' ' && !pendingToken) {
                tokens.push(part);
                part = '';
            } else {
                if (cmdline.charAt(i) === '\"') {
                    pendingToken = !pendingToken;
                } else {
                    part += cmdline.charAt(i);
                }
            }
        }
        tokens.push(part);
        return tokens;
    }

    self.execute = function(cmdline) {
        var args = parseCommand(cmdline);
        var cmd = args.shift();
        if (self.items.hasOwnProperty(cmd)) {
            var meta = self.items[cmd];
            meta.code.call(meta.code, args);
        } else {
            Front.contentCommand({
                action: 'executeScript',
                cmdline: cmdline
            });
        }
    };

    return self;
})();
Omnibar.addHandler('Commands', Commands);

const OmniQuery = (function() {
    var self = {
        prompt: 'ǭ'
    };

    function onlyUnique(value, index, self) {
        return self.indexOf(value) === index;
    }
    var _words;
    self.onOpen = function(arg) {
        if (arg) {
            Omnibar.input.value = arg;
            Front.contentCommand({
                action: 'omnibar_query_entered',
                query: arg
            });
        }
        Front.contentCommand({
            action: 'getPageText'
        }, function(message) {
            var splitRegex = /[^a-zA-Z]+/;
            _words = message.data.toLowerCase().split(splitRegex).filter(onlyUnique);
        });
    };

    self.onInput = function() {
        var iw = Omnibar.input.value;
        var candidates = _words.filter(function(w) {
            return w.indexOf(iw) !== -1;
        });
        if (candidates.length) {
            Omnibar.listResults(candidates, function(w) {
                return createElementWithContent('li', w);
            });
        }
    };

    self.onTabKey = function() {
        Omnibar.input.value = Omnibar.resultsDiv.querySelector('li.focused').innerText;
    };

    self.onEnter = function() {
        Front.contentCommand({
            action: 'omnibar_query_entered',
            query: Omnibar.input.value
        });
    };

    return self;
})();
Omnibar.addHandler('OmniQuery', OmniQuery);

const OpenUserURLs = (function() {
    var self = {
        focusFirstCandidate: true,
        prompt: `UserURLs${separatorHtml}`
    };

    var _items;
    self.onOpen = function(args) {
        _items = args;
        self.onInput();
    };

    self.onInput = function() {
        var query = Omnibar.input.value;
        var urls = [];

        for (var m of _items) {
            if (query === "" || m.title.indexOf(query) !== -1 || m.url.indexOf(query) !== -1) {
                urls.push({
                    title: m.title,
                    type: '🍆',
                    url: m.url
                });
            }
        }
        Omnibar.listURLs(urls, false);
    };
    self.onEnter = Omnibar.openFocused.bind(self);
    return self;
})();
Omnibar.addHandler('UserURLs', OpenUserURLs);
