(function () {
'use strict';

Vue.config.debug = true;

window.Guacamoly = window.Guacamoly || {};
var Core = window.Guacamoly.Core;

var md = window.markdownit({
    breaks: true,
    html: true,
    linkify: true
}).use(window.markdownitEmoji)
.use(window.markdownitCheckbox);

md.renderer.rules.emoji = function(token, idx) {
  return twemoji.parse(token[idx].content);
};

Vue.filter('markdown', function (value) {
    if (!value) return '';

    return md.render(value);
});

Vue.filter('prettyDateOffset', function (time) {
    var date = new Date(time),
        diff = (((new Date()).getTime() - date.getTime()) / 1000),
        day_diff = Math.floor(diff / 86400);

    if (isNaN(day_diff) || day_diff < 0)
        return;

    return day_diff === 0 && (
            diff < 60 && 'just now' ||
            diff < 120 && '1 minute ago' ||
            diff < 3600 && Math.floor( diff / 60 ) + ' minutes ago' ||
            diff < 7200 && '1 hour ago' ||
            diff < 86400 && Math.floor( diff / 3600 ) + ' hours ago') ||
        day_diff === 1 && 'Yesterday' ||
        day_diff < 7 && day_diff + ' days ago' ||
        day_diff < 31 && Math.ceil( day_diff / 7 ) + ' weeks ago' ||
        day_diff < 365 && Math.round( day_diff / 30 ) +  ' months ago' ||
                          Math.round( day_diff / 365 ) + ' years ago';
});

function getCurrentSearchWord() {
    if (!vue) return '';

    var cursorPos = vue.$els.searchinput.selectionStart;
    var search = vue.search;
    var word = '';

    for (var i = 0; i < search.length; ++i) {
        // break if we went beyond and we hit a space
        if (i > cursorPos && search[i] === ' ') break;

        if (search[i] === ' ') word = '';
        else word += search[i];
    }

    return word;
}

function findById(id) {
    for (var i = 0; i < vue.things.length; ++i) {
        if (vue.things[i].id === id) return vue.things[i];
    }

    return null;
}

Vue.filter('proposeTags', function (options) {
    var word = getCurrentSearchWord().replace(/^#/, '');

    return options.filter(function (o) {
        return (o.name.indexOf(word) >= 0) && (o.name !== word);
    });
});

var vue = new Vue({
    el: '#application',
    data: {
        tags: [],
        things: [],
        busyLogin: false,
        busyThings: true,
        busyFetchMore: false,
        search: '',
        username: '',
        password: '',
        displayName: '',
        settings: Core.settings.data,
        mainView: '',
        thingContent: '',
        activeThing: {},
        shareThingLink: '',
        importFile: null
    },
    methods: {
        giveAddFocus: function () {
            this.$els.addinput.focus();
        },
        addThing: function () {
            Core.things.add(this.thingContent, function (error, thing) {
                if (error) return console.error(error);
                vue.thingContent = '';
                vue.things.unshift(thing);
            });
        },
        showThingEdit: function (thing) {
            thing.edit = true;

            Vue.nextTick(function() {
                var margin = 20;

                $('#textarea-' + thing.id).focus();
                $('#textarea-' + thing.id).height($(window).height() - $('.navigation').height() - (margin*2) - 60);
                window.scroll(0, $('#card-' + thing.id).offset().top - $('.navigation').height() - margin);
            });
        },
        activateProposedTag: function (tag) {
            var word = getCurrentSearchWord();

            if (!word) vue.search += '#' + tag.name;
            else vue.search = vue.search.replace(getCurrentSearchWord(), '#' + tag.name);

            if (vue.search === '#' + tag.name) window.location.href = '/#search?#' + tag.name;

            vue.$els.searchinput.focus();
        },
        saveEdit: function (thing) {
            Core.things.edit(thing, function (error, result) {
                if (error) return console.error(error);

                // update the enhanced content from the server
                thing.richContent = result.richContent;
                thing.edit = false;
            });
        },
        cancelEdit: function (thing) {
            thing.edit = false;
        },
        showThingDel: function (thing) {
            this.activeThing = thing;
            $('#modalDel').modal('show');
        },
        deleteThing: function () {
            var that = this;

            if (!this.activeThing) return;

            Core.things.del(this.activeThing, function (error) {
                if (error) return console.error(error);

                var i;
                for (i = 0; i < that.things.length; ++i) {
                    if (that.things[i].id === that.activeThing.id) break;
                }

                // remove if found
                if (i < that.things.length) that.things.splice(i, 1);

                that.activeThing = null;

                $('#modalDel').modal('hide');
            });
        },
        showThingShare: function (thing) {
            Core.things.publicLink(thing, function (error, publicLinkId) {
                if (error) return console.error(error);

                vue.shareThingLink = location.origin + '/thing.html?id=' + publicLinkId;

                $('#modalShare').modal('show');
            });
        },
        saveSettings: function () {
            Core.settings.set(this.settings);
            Core.settings.save(function (error) {
                if (error) return console.error(error);

                $('#modalSettings').modal('hide');
            });
        },
        logout: function () {
            Core.session.logout();
        },
        doLogin: function () {
            vue.busyLogin = true;

            Core.session.login(this.username, this.password, function (error, user) {
                vue.busyLogin = false;

                if (error) {
                    vue.username = '';
                    vue.password = '';
                    Vue.nextTick(function () { $('#inputUsername').focus(); });

                    return console.error('Login failed:', error.status ? error.status : error);
                }

                main();
            });
        },
        refresh: function () {
            refresh();
        },
        doSearch: function () {
            window.location.href = '/#search?' + encodeURIComponent(this.search);
        },
        tagSearch: function (tag) {
            window.location.href = '/#search?#' + encodeURIComponent(tag.name);
        },
        clearSearch: function () {
            vue.search = '';
            refresh();
            $('#inputSearch').focus();
        },
        exportThings: function () {
            Core.things.export();
        },
        importFileChanged: function () {
            this.importFile = this.$els.importfile.files[0];
        },
        importThings: function () {
            var data = new FormData();
            data.append('import', this.$els.importfile.files[0]);

            Core.things.import(data, function (error) {
                if (error) console.error(error);

                // vueSettings.hide();
                vue.importFile = null;

                // TODO refresh
            });
        },
        importThingsCancel: function () {
            this.importFile = null;
        },
        triggerImportInput: function () {
            this.$els.importfile.click();
        }
    }
});

window.app = vue;

Core.settings.onChanged(function (data) {
    if (data.title) window.document.title = data.title;
    if (data.backgroundUrl) window.document.body.style.backgroundImage = 'url("' + data.backgroundUrl + '")';
});

function hashChangeHandler() {
    var action = window.location.hash.split('?')[0];
    var params = window.location.hash.indexOf('?') > 0 ? decodeURIComponent(window.location.hash.slice(window.location.hash.indexOf('?') + 1)) : null;

    if (action === '#add') {
        vue.showThingAdd();
    } else if (action === '#search' && params !== null) {
        vue.search = params;
        refresh(vue.search);
    } else {
        refresh(vue.search);
    }
}

window.addEventListener('hashchange', hashChangeHandler, false);

function handleSaveShortcut() {
    if (document.activeElement && document.activeElement.id && document.activeElement.id.split('-')[1]) {
        var thing = findById(document.activeElement.id.split('-')[1]);
        if (thing) vue.saveEdit(thing);
    } else if (document.activeElement && document.activeElement.id === 'addTextarea') {
        vue.addThing();
    }
}

shortcut.add('Ctrl+s', handleSaveShortcut, {});
shortcut.add('Ctrl+Enter', handleSaveShortcut, {});

function reset() {
    vue.mainView = 'login';
    vue.things = [];
    vue.tags = [];
    vue.search = '';
    vue.username = '';
    vue.password = '';
    Core.settings.reset();

    Vue.nextTick(function () { $('#inputUsername').focus(); });
}

function main() {
    Core.session.profile(function (error, profile) {
        if (error) return console.error(error);

        vue.displayName = profile.displayName || profile.username || profile.email;

        Core.settings.get(function (error) {
            if (error) return console.error(error);

            Core.tags.get(function (error, tags) {
                if (error) return console.error(error);

                vue.tags = tags;
                vue.mainView = 'content';

                window.setTimeout(function () { vue.$els.searchinput.focus(); }, 0);

                hashChangeHandler();
            });
        });
    });
}

function refresh(search) {
    vue.busyThings = true;

    window.location.href = '/#search?' + (search ? encodeURIComponent(search) : '');

    Core.things.get(search || '', function (error, data) {
        if (error) return console.error(error);

        vue.things = data;
        vue.busyThings = false;

        // add global object for browser extensions
        document.getElementById('guacamoly-settings-node').textContent = JSON.stringify({
            origin: Core.origin(),
            token: Core.token(),
            title: Core.settings.data.title
        });
    });
}

Core.loginFailed = reset;
Core.onLogout = reset;

// Main
main();

window.addEventListener('scroll', function () {
    // add 1 full pixel to be on the safe side for zoom settings, where pixel values might be floats
    if ($(window).height() + $(window).scrollTop() + 1 >= $(document).height()) {
        // prevent from refetching while in progress
        if (vue.busyFetchMore) return;

        vue.busyFetchMore = true;

        Core.things.fetchMore(function (error, result) {
            vue.busyFetchMore = false;

            if (error) return console.error(error);

            vue.things = vue.things.concat(result);
        });
    }
});

})();
