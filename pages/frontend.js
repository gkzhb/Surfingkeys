Normal.enter();

function command(cmd, annotation, jscode) {
    var cmd_code = {
        code: jscode
    };
    var ag = _parseAnnotation({annotation: annotation, feature_group: 14});
    cmd_code.feature_group = ag.feature_group;
    cmd_code.annotation = ag.annotation;
    Commands.items[cmd] = cmd_code;
}

command('setProxy', 'setProxy <proxy_host>:<proxy_port> [proxy_type|PROXY]', function(args) {
    // args is an array of arguments
    var proxy = ((args.length > 1) ? args[1] : "PROXY") + " " + args[0];
    RUNTIME('updateProxy', {
        proxy: proxy
    });
    return true;
});

command('setProxyMode', 'setProxyMode <always|direct|byhost|system|clear>', function(args) {
    RUNTIME("updateProxy", {
        mode: args[0]
    }, function(rs) {
        if (["byhost", "always"].indexOf(rs.proxyMode) !== -1) {
            Front.showBanner("{0}: {1}".format(rs.proxyMode, rs.proxy), 3000);
        } else {
            Front.showBanner(rs.proxyMode, 3000);
        }
    });
    // return true to close Omnibar for Commands, false to keep Omnibar on
    return true;
});

command('listVoices', 'list tts voices', function() {
    RUNTIME('getVoices', null, function(response) {

        var voices = response.voices.map(function(s) {
            return `<tr><td>${s.voiceName}</td><td>${s.lang}</td><td>${s.gender}</td><td>${s.remote}</td></tr>`;
        });
        voices.unshift("<tr style='font-weight: bold;'><td>voiceName</td><td>lang</td><td>gender</td><td>remote</td></tr>");
        Front.showPopup("<table style='width:100%'>{0}</table>".format(voices.join('')));

    });
});
command('testVoices', 'testVoices <locale> <text>', function(args) {
    RUNTIME('getVoices', null, function(response) {

        var voices = response.voices, i = 0;
        if (args.length > 0) {
            voices = voices.filter(function(v) {
                return v.lang.indexOf(args[0]) !== -1;
            });
        }
        var textToRead = "This is to test voice with SurfingKeys";
        if (args.length > 1) {
            textToRead = args[1];
        }
        var text;
        for (i = 0; i < voices.length - 1; i++) {
            text = `${textToRead}, ${voices[i].voiceName} / ${voices[i].lang}.`;
            readText(text, {
                enqueue: true,
                verbose: true,
                voiceName: voices[i].voiceName
            });
        }
        text = `${textToRead}, ${voices[i].voiceName} / ${voices[i].lang}.`;
        readText(text, {
            enqueue: true,
            verbose: true,
            voiceName: voices[i].voiceName,
            onEnd: function() {
                Front.showPopup("All voices test done.");
            }
        });
    });
});
command('stopReading', '#13Stop reading.', function(args) {
    RUNTIME('stopReading');
});
command('feedkeys', 'feed mapkeys', function(args) {
    Normal.feedkeys(args[0]);
});
command('quit', '#5quit chrome', function() {
    RUNTIME('quit');
});
command('clearHistory', 'clearHistory <find|cmd|...>', function(args) {
    runtime.updateHistory(args[0], []);
});
command('listSession', 'list session', function() {
    if (Front.omnibar.style.display === "none") {
        Front.openOmnibar({ type: "Commands" });
    }
    RUNTIME('getSettings', {
        key: 'sessions'
    }, function(response) {
        Omnibar.listResults(Object.keys(response.settings.sessions), function(s) {
            return createElementWithContent('li', s);
        });
    });
});
command('createSession', 'createSession [name]', function(args) {
    RUNTIME('createSession', {
        name: args[0]
    });
});
command('deleteSession', 'deleteSession [name]', function(args) {
    RUNTIME('deleteSession', {
        name: args[0]
    });
    return true; // to close omnibar after the command executed.
});
command('openSession', 'openSession [name]', function(args) {
    RUNTIME('openSession', {
        name: args[0]
    });
});
command('listQueueURLs', 'list URLs in queue waiting for open', function(args) {
    RUNTIME('getQueueURLs', null, function(response) {
        Omnibar.listResults(response.queueURLs, function(s) {
            return createElementWithContent('li', s);
        });
    });
});
command('timeStamp', 'print time stamp in human readable format', function(args) {
    var dt = new Date(parseInt(args[0]));
    Omnibar.listWords([dt.toString()]);
});
command('userAgent', 'set user agent', function(args) {
    // 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1'
    RUNTIME('setUserAgent', {
        userAgent: args.join(' ')
    });
});

command('setV3ExtensionId', 'set V3 Extension Id', function(args) {
  RUNTIME('setV3ExtensionId', { id: args[0] });
});
command('group', 'group tabs: [tid] [n]', function(args) {
    const param = {};
    switch (args.length) {
        case 1:
            param.tabIndices = [parseInt(args[0])];
            break;
        case 2:
            param.tabIndices = [];
            const n = parseInt(args[1]);
            const base = parseInt(args[0]);
            for (let i = 0; i < n; i++) {
                param.tabIndices.push(base + i);
            }
            break;
    }
    RUNTIME('group', param);
});
command("moveToGroup", "move tabs to group: [gid] [tid] [n]", function (args) {
    const param = { tabIndices: [] };
    switch (args.length) {
        case 3:
            const base = parseInt(args[1]);
            const n = parseInt(args[2]);
            for (let i = 0; i < n; i++) {
                param.tabIndices.push(base + i);
            }
        case 2:
            if (param.tabIndices) {
                param.tabIndices.push(parseInt(args[1]));
            }
        case 1:
            param.groupIndex = parseInt(args[0]);
            RUNTIME('groupByIndex', param);
            break;
        case 0:
    }
});
command("ungroup", "move tabs out of group: [tid] [n]", function (args) {
    const param = {};
    switch (args.length) {
        case 1:
            param.tabIndices = [parseInt(args[0])];
            break;
        case 2:
            param.tabIndices = [];
            const n = parseInt(args[1]);
            const base = parseInt(args[0]);
            for (let i = 0; i < n; i++) {
                param.tabIndices.push(base + i);
            }
            break;
    }
    RUNTIME('ungroup', param);
});
command("removeGroup", "remove group but remain tabs: [gid]", function (args) {
    const param = {};
    if (args.length > 0) {
        param.groupIndex = parseInt(args[0]);
    }
    RUNTIME('removeGroup', param);
});
command("renameGroup", "rename group: [name] [gid]", function (args) {
    const param = {};
    switch (args.length) {
        case 2:
            param.groupIndex = parseInt(args[1]);
        case 1:
            param.title = args[0];
    }
    RUNTIME('updateGroupByIndex', param);
});
command("colorGroup", 'set group color: <color> [grid] ("grey", "blue", "red", "yellow", "green", "pink", "purple", or "cyan")', function (args) {
    const param = {};
    switch (args.length) {
        case 2:
            param.groupIndex = parseInt(args[1]);
        case 1:
            param.color = args[0];
    }
    RUNTIME('updateGroupByIndex', param);
});
command("toggleCollapseGroup", "collapse/uncollapse group: [gid]", function (args) {
    const param = {};
    if (args.length > 0) {
        param.groupIndex = parseInt(args[0]);
    }
    RUNTIME('toggleCollapseGroup', param);
});
command("moveGroup", "change group position", function (args) {
    // TODO: api design
});
