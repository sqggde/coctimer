(function (global) {
    'use strict';

    const CocTool = global.CocTool;
    if (!CocTool) {
        throw new Error('svg-icons.js requires core.js');
    }

    // 图标路径注册表（单一事实来源：键 = fa 类名后缀，值 = 相对 assets 根目录路径；
    // 用户替换 img/svg/ 下文件后重启即生效，无需改此表）
    const ICON_PATHS = {
        'question-circle': 'img/svg/nav/question-circle.svg',
        'pie-chart': 'img/svg/nav/pie-chart.svg',
        'tasks': 'img/svg/nav/tasks.svg',
        'shield': 'img/svg/nav/shield.svg',
        'cog': 'img/svg/nav/cog.svg',
        'book': 'img/svg/help/book.svg',
        'lightbulb-o': 'img/svg/help/lightbulb-o.svg',
        'qq': 'img/svg/help/qq.svg',
        'external-link': 'img/svg/help/external-link.svg',
        'file-text-o': 'img/svg/help/file-text-o.svg',
        'save': 'img/svg/help/save.svg',
        'cloud-download': 'img/svg/help/cloud-download.svg',
        'sign-in': 'img/svg/help/sign-in.svg',
        'globe': 'img/svg/help/globe.svg',
        'heart': 'img/svg/help/heart.svg',
        'magic': 'img/svg/help/magic.svg',
        'chevron-down': 'img/svg/overview/chevron-down.svg',
        'refresh': 'img/svg/overview/refresh.svg',
        'user': 'img/svg/overview/user.svg',
        'users': 'img/svg/overview/users.svg',
        'clock-o': 'img/svg/progress/clock-o.svg',
        'cube': 'img/svg/progress/cube.svg',
        'flask': 'img/svg/progress/flask.svg',
        'rocket': 'img/svg/progress/rocket.svg',
        'paw': 'img/svg/progress/paw.svg',
        'moon-o': 'img/svg/progress/moon-o.svg',
        'eye-slash': 'img/svg/progress/eye-slash.svg',
        'bomb': 'img/svg/progress/bomb.svg',
        'truck': 'img/svg/progress/truck.svg',
        'home': 'img/svg/progress/home.svg',
        'shield-alt': 'img/svg/progress/shield-alt.svg',
        'spinner': 'img/svg/progress/spinner.svg',
        'check': 'img/svg/progress/check.svg',
        'database': 'img/svg/progress/database.svg',
        'inbox': 'img/svg/progress/inbox.svg',
        'plus': 'img/svg/progress/plus.svg',
        'picture-o': 'img/svg/progress/picture-o.svg',
        'sort': 'img/svg/progress/sort.svg',
        'more': 'img/svg/progress/more.svg',
        'list-alt': 'img/svg/progress/list-alt.svg',
        'filter': 'img/svg/progress/filter.svg',
        'chevron-right': 'img/svg/progress/chevron-right.svg',
        'bell': 'img/svg/clan/bell.svg',
        'cloud-upload': 'img/svg/clan/cloud-upload.svg',
        'cloud': 'img/svg/clan/cloud.svg',
        'link': 'img/svg/clan/link.svg',
        'arrow-left': 'img/svg/clan/arrow-left.svg',
        'download': 'img/svg/clan/download.svg',
        'upload': 'img/svg/clan/upload.svg',
        'th-large': 'img/svg/settings/th-large.svg',
        'exclamation-triangle': 'img/svg/settings/exclamation-triangle.svg',
        'check-circle': 'img/svg/settings/check-circle.svg',
        'times': 'img/svg/common/times.svg',
        'trash': 'img/svg/common/trash.svg',
        'bars': 'img/svg/common/bars.svg',
        'info-circle': 'img/svg/common/info-circle.svg',
        'question': 'img/svg/common/question.svg',
        'user-plus': 'img/svg/common/user-plus.svg',
        'building': 'img/svg/common/building.svg',
        'launch-game': 'img/svg/common/launch-game.svg',
        'search': 'img/svg/progress/search.svg'
    };

    let iconData = null;  // { svgs: {name: text}, imgFallback: {name: path} }
    let observer = null;

    function stripBom(text) {
        return text ? text.replace(/^\uFEFF/, '') : text;
    }

    function readAssetText(relPath) {
        if (global.AndroidApp && global.AndroidApp.readAsset) {
            const text = global.AndroidApp.readAsset(relPath);
            return (typeof text === 'string' && text.length > 0) ? stripBom(text) : null;
        }
        return null;
    }

    function fetchAssetText(relPath) {
        if (typeof global.fetch !== 'function') return Promise.resolve(null);
        return fetch(relPath).then(function (res) {
            if (!res.ok) return null;
            return res.text();
        }).then(function (text) {
            return text ? stripBom(text) : null;
        }).catch(function () { return null; });
    }

    function loadSvgFiles() {
        const svgs = {};
        const imgFallback = {};
        const pending = [];
        Object.keys(ICON_PATHS).forEach(function (name) {
            const rel = ICON_PATHS[name];
            const text = readAssetText(rel);
            if (text !== null) {
                svgs[name] = text;
            } else {
                imgFallback[name] = rel;
                pending.push(rel);
            }
        });
        if (!pending.length) return Promise.resolve({ svgs: svgs, imgFallback: imgFallback });
        return Promise.all(pending.map(function (rel) {
            return fetchAssetText(rel).then(function (text) {
                const name = rel.split('/').pop().replace(/\.svg$/, '');
                if (text) {
                    svgs[name] = text;
                    delete imgFallback[name];
                }
            });
        })).then(function () { return { svgs: svgs, imgFallback: imgFallback }; });
    }

    function loadIcons() {
        if (iconData) return Promise.resolve(iconData);
        return loadSvgFiles().then(function (data) {
            iconData = data;
            return data;
        });
    }

    function iconNameOf(el) {
        const classList = el.classList || [];
        for (let i = 0; i < classList.length; i++) {
            const cls = classList[i];
            if (cls.indexOf('fa-') === 0 && cls !== 'fa-spin') {
                return cls.slice(3);
            }
        }
        return null;
    }

    function hydrateElement(el, data) {
        if (el.getAttribute('data-svg-injected') === '1') return;
        const name = iconNameOf(el);
        if (!name) return;
        if (data.svgs[name]) {
            el.innerHTML = data.svgs[name];
        } else if (data.imgFallback[name]) {
            el.innerHTML = '<img src="' + data.imgFallback[name] + '" alt="">';
        } else {
            return;
        }
        el.setAttribute('data-svg-injected', '1');
    }

    function hydrate(root, data) {
        const nodes = root.querySelectorAll ? root.querySelectorAll('i.fa') : [];
        nodes.forEach(function (el) {
            hydrateElement(el, data);
        });
    }

    function scanElement(el, data) {
        if (el.tagName === 'I' && el.classList && el.classList.contains('fa')) {
            hydrateElement(el, data);
        }
        if (el.querySelectorAll) {
            hydrate(el, data);
        }
    }

    function startObserver(data) {
        if (!global.MutationObserver || observer) return;
        observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                mutation.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    scanElement(node, data);
                });
            });
        });
        if (global.document && global.document.body) {
            observer.observe(global.document.body, { childList: true, subtree: true });
        }
    }

    function init() {
        loadIcons().then(function (data) {
            if (!global.document || !global.document.body) return;
            hydrate(global.document, data);
            startObserver(data);
        }).catch(function () { /* 图标加载失败不影响页面功能 */ });
    }

    function getIconSvg(name) {
        if (!iconData) return null;
        return iconData.svgs[name] || null;
    }

    CocTool.svgIcons = {
        init: init,
        hydrate: hydrate,
        getIconSvg: getIconSvg,
        iconNameOf: iconNameOf,
        ICON_PATHS: ICON_PATHS
    };
})(window);