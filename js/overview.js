(function (global) {
    'use strict';
    var CocTool = global.CocTool = global.CocTool || {};
    CocTool.features = CocTool.features || {};

    var state = CocTool.state;
    var names = CocTool.names;
    var initialized = false;
    var el = {};
    var tickTimer = null;
    var sortMode = (function () { try { return localStorage.getItem('ov_sort_mode') || 'default'; } catch (e) { return 'default'; } })();
    var sortDropdownBound = false;

    // 排序键：该账号所有升级项目（含已完成）中完成时间最早的一个（用户规则：最早完成的升级项目）
    function getNextCompletionTs(data) {
        try {
            var pr = CocTool.features.progress;
            var now = Math.floor(Date.now() / 1000);
            var items = pr.extractUpgradingItems(data, now, true);
            var best = Infinity;
            for (var i = 0; i < items.length; i++) {
                var cts = pr.calculateCompletionTimestamp(items[i], data);
                if (cts < best) best = cts;
            }
            return best === Infinity ? null : best;
        } catch (e) { return null; }
    }

    function getCompletedItems(data) {
        try {
            var pr = CocTool.features.progress;
            var now = Math.floor(Date.now() / 1000);
            var all = pr.extractUpgradingItems(data, now, true);
            var done = [];
            for (var i = 0; i < all.length; i++) {
                var cts = pr.calculateCompletionTimestamp(all[i], data);
                if (cts <= now) done.push({ item: all[i], cts: cts });
            }
            done.sort(function(a,b) { return a.cts - b.cts; });
            return done;
        } catch (e) { return []; }
    }

    function initSortDropdown() {
        if (sortDropdownBound) return;
        sortDropdownBound = true;
        var btn = document.getElementById('ov-sort-btn');
        var dropdown = document.getElementById('ov-sort-dropdown');
        if (!btn || !dropdown) return;
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', function () { dropdown.classList.add('hidden'); });
        dropdown.addEventListener('click', function (e) { e.stopPropagation(); });
        var options = dropdown.querySelectorAll('.ov-sort-option');
        for (var i = 0; i < options.length; i++) {
            options[i].addEventListener('click', function () {
                var mode = this.getAttribute('data-mode');
                setSortMode(mode);
                dropdown.classList.add('hidden');
            });
        }
    }

    function setSortMode(mode) {
        sortMode = mode;
        try { localStorage.setItem('ov_sort_mode', mode); } catch (e) {}
        var btn = document.getElementById('ov-sort-btn');
        if (btn) {
            btn.innerHTML = (mode === 'time' ? '时间排序' : '默认排序') + ' <i class="fa fa-chevron-down" style="font-size:10px;margin-left:4px"></i>';
        }
        var options = document.querySelectorAll('.ov-sort-option');
        for (var i = 0; i < options.length; i++) {
            options[i].classList.toggle('active', options[i].getAttribute('data-mode') === mode);
        }
        renderCards();
    }

    function cdClass(sec) {
        if (sec <= 1800) return 'cd-red';
        if (sec <= 3600) return 'cd-orangered';
        if (sec <= 14400) return 'cd-orange';
        if (sec <= 28800) return 'cd-yellow';
        return 'cd-blue';
    }

    function tickCountdowns() {
        var spans = el.cards ? el.cards.querySelectorAll('.acc-countdown') : [];
        for (var i = 0; i < spans.length; i++) {
            var rem = parseInt(spans[i].getAttribute('data-remaining'), 10);
            if (isNaN(rem)) continue;
            rem--;
            if (rem <= 0) {
                var card = spans[i].closest('.account-card');
                if (card) refreshCard(card.getAttribute('data-tag'));
            } else {
                spans[i].setAttribute('data-remaining', rem);
                spans[i].textContent = formatCountdown(rem);
                spans[i].className = 'acc-countdown ' + cdClass(rem);
            }
        }
    }

    function startTick() {
        if (tickTimer) return;
        tickTimer = setInterval(tickCountdowns, 1000);
    }

    function stopTick() {
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    function init() {
        if (!initialized) {
            initialized = true;
            el.page = document.getElementById('overview-page');
            el.cards = document.getElementById('overview-cards');
            el.emptyState = document.getElementById('overview-empty-state');
            CocTool.overviewDetail.initDetail();
            initSortDropdown();
        }
        if (el.detailPage) el.detailPage.style.display = 'none';
        stopTick();
        setSortMode(sortMode);
        startTick();
    }

    function renderCards() {
        if (!el.cards) return;
        var order = state.accountOrder || [];
        if (!order.length || !state.accounts) {
            if (el.emptyState) el.emptyState.style.display = '';
            el.cards.innerHTML = '';
            el.cards.style.display = 'none';
            return;
        }
        if (el.emptyState) el.emptyState.style.display = 'none';
        el.cards.innerHTML = '';
        el.cards.style.display = 'block';
        if (sortMode === 'time') {
            var tagTimes = [];
            for (var i = 0; i < order.length; i++) {
                var tag = order[i];
                var data = state.accounts[tag];
                if (!data) continue;
                tagTimes.push({ tag: tag, data: data, cts: getNextCompletionTs(data) });
            }
            tagTimes.sort(function (a, b) {
                if (a.cts === null && b.cts === null) return 0;
                if (a.cts === null) return 1;
                if (b.cts === null) return -1;
                return a.cts - b.cts;
            });
            for (var i = 0; i < tagTimes.length; i++) {
                el.cards.appendChild(buildAccountCard(tagTimes[i].tag, tagTimes[i].data));
            }
        } else {
            for (var i = 0; i < order.length; i++) {
                var tag = order[i];
                var data = state.accounts[tag];
                if (!data) continue;
                el.cards.appendChild(buildAccountCard(tag, data));
            }
        }
    }

    function findThLevel(data) {
        if (!data.buildings) return 0;
        for (var i = 0; i < data.buildings.length; i++) {
            if (data.buildings[i].data === 1000001) return data.buildings[i].lvl || 0;
        }
        return 0;
    }

    function buildAccountCard(tag, data) {
        var note = state.accountNotes && state.accountNotes[tag];
        var th = findThLevel(data);
        var card = document.createElement('div');
        card.className = 'account-card';
        card.setAttribute('data-tag', tag);
        var thIcon = th ? 'img/icons/buildings/1000001_' + th + '.webp' : 'img/icons/20260627.webp';
        var img = document.createElement('img');
        img.className = 'acc-icon';
        img.src = thIcon;
        img.onerror = function () { this.style.display = 'none'; };
        img.addEventListener('click', (function (t) { return function (e) { e.stopPropagation(); CocTool.overviewDetail.openDetail(t); }; })(tag));
        card.appendChild(img);
        var infoWrap = document.createElement('div');
        infoWrap.className = 'acc-info';
        var nameSpan = document.createElement('span');
        nameSpan.className = 'acc-name';
        nameSpan.textContent = note || data.tag || tag;
        infoWrap.appendChild(nameSpan);
        if (data._server) {
            var srvSpan = document.createElement('span');
            srvSpan.className = 'acc-server';
            srvSpan.setAttribute('data-srv', data._server);
            srvSpan.textContent = data._server === 'cn' ? '国服' : '国际服';
            infoWrap.appendChild(srvSpan);
        }
        card.appendChild(infoWrap);
        card.addEventListener('click', function () {
            CocTool.navigation.showPage('progress');
            if (CocTool.features.accounts && CocTool.features.accounts.switchAccount) {
                CocTool.features.accounts.switchAccount(tag);
            }
        });
        // 右侧倒计时 + 已完成图标
        var rightDiv = document.createElement('div');
        rightDiv.className = 'acc-right';
        try {
            var pr = CocTool.features.progress;
            var now = Math.floor(Date.now() / 1000);
            var bestItem = null, bestRemaining = Infinity;
            var items = pr.extractUpgradingItems(data, now, false);
            for (var i = 0; i < items.length; i++) {
                var cts = pr.calculateCompletionTimestamp(items[i], data);
                var rem = cts - now;
                if (rem > 0 && rem < bestRemaining) {
                    bestRemaining = rem;
                    bestItem = items[i];
                }
            }
            // 倒计时行
            var countdownRow = document.createElement('div');
            countdownRow.className = 'acc-countdown-row';
            if (bestItem) {
                var iconImg = document.createElement('img');
                iconImg.className = 'acc-upgrade-icon';
                var iconUrls = CocTool.calc.getItemIconUrl(bestItem);
                if (iconUrls && iconUrls[0]) {
                    iconImg.src = iconUrls[0];
                    if (iconUrls.length > 1) {
                        iconImg.setAttribute('data-fallback', iconUrls.slice(1).join(','));
                        iconImg.addEventListener('error', function fb(e) {
                            var f = this.getAttribute('data-fallback');
                            if (f) {
                                var n = f.split(',')[0];
                                this.setAttribute('data-fallback', f.substring(n.length + 1));
                                this.src = n;
                            } else { this.style.display = 'none'; }
                        });
                    }
                } else { iconImg.style.display = 'none'; }
                var sc = bestItem.supercharge;
                if (sc !== undefined) {
                    var wrap = document.createElement('div');
                    wrap.style.cssText = 'position:relative;display:inline-flex;';
                    wrap.appendChild(iconImg);
                    var sci = document.createElement('img');
                    sci.src = 'img/icons/Icon_Supercharge.webp';
                    sci.style.cssText = 'position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);width:14px;height:14px;';
                    wrap.appendChild(sci);
                    if (sc === 1) {
                        var sci2 = document.createElement('img');
                        sci2.src = 'img/icons/Icon_Supercharge.webp';
                        sci2.style.cssText = 'width:14px;height:14px;';
                        var inner = document.createElement('span');
                        inner.style.cssText = 'position:absolute;bottom:-1px;left:50%;transform:translateX(-50%);display:flex;gap:1px;line-height:0;';
                        inner.appendChild(sci);
                        inner.appendChild(sci2);
                        wrap.removeChild(sci);
                        wrap.appendChild(inner);
                    }
                    countdownRow.appendChild(wrap);
                } else {
                    countdownRow.appendChild(iconImg);
                }
                var timeSpan = document.createElement('span');
                timeSpan.className = 'acc-countdown ' + cdClass(bestRemaining);
                timeSpan.setAttribute('data-remaining', Math.ceil(bestRemaining));
                timeSpan.textContent = formatCountdown(bestRemaining);
                countdownRow.appendChild(timeSpan);
            }
            rightDiv.appendChild(countdownRow);
            // 已完成行
            var extrasRow = document.createElement('div');
            extrasRow.className = 'acc-extras';
            // 助手
            var helpers = data.helpers || [];
            var wk = helpers.find(function(h) { return h.data === 93000000 || h.data === 124000000; });
            if (wk && CocTool.calc.isHelperReady(data, wk.data, ["buildings", "heroes", "traps", "guardians"])) {
                var wi = document.createElement('img');
                wi.className = 'acc-extra-icon';
                wi.src = 'img/icons/BHelper.webp';
                wi.onerror = function() { this.style.display = 'none'; };
                extrasRow.appendChild(wi);
            }
            var lk = helpers.find(function(h) { return h.data === 93000001 || h.data === 124000001; });
            if (lk && CocTool.calc.isHelperReady(data, lk.data, ["units", "siege_machines", "spells"])) {
                var li = document.createElement('img');
                li.className = 'acc-extra-icon';
                li.src = 'img/icons/LHelper.webp';
                li.onerror = function() { this.style.display = 'none'; };
                extrasRow.appendChild(li);
            }
            // 钟楼
            if (CocTool.calc.isClockTowerReady(data)) {
                var ci = document.createElement('img');
                ci.className = 'acc-extra-icon';
                ci.src = 'img/icons/CT.webp';
                ci.onerror = function() { this.style.display = 'none'; };
                extrasRow.appendChild(ci);
            }
            // 已完成建筑（最多5个）
            var doneList = getCompletedItems(data);
            var maxShow = Math.min(doneList.length, 5);
            for (var di = 0; di < maxShow; di++) {
                (function(doneItem) {
                    var bi = document.createElement('img');
                    bi.className = 'acc-extra-icon acc-comp-bg';
                    var u = CocTool.calc.getItemIconUrl(doneItem.item);
                    bi.src = (u && u[0]) ? u[0] : 'img/icons/20260627.webp';
                    if (u && u.length > 1) {
                        bi.setAttribute('data-fallback', u.slice(1).join(','));
                        bi.addEventListener('error', function fb(e) {
                            var f = this.getAttribute('data-fallback');
                            if (f) { var n = f.split(',')[0]; this.setAttribute('data-fallback', f.substring(n.length + 1)); this.src = n; }
                            else { this.style.display = 'none'; }
                        });
                    }
                    bi.onerror = function() { this.style.display = 'none'; };
                    extrasRow.appendChild(bi);
                })(doneList[di]);
            }
            if (extrasRow.children.length > 0) rightDiv.appendChild(extrasRow);
        } catch (e) {}
        card.appendChild(rightDiv);
        return card;
    }

    function formatCountdown(sec) {
        if (sec <= 0) return '0:00:00';
        var d = Math.floor(sec / 86400);
        var h = Math.floor((sec % 86400) / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = Math.floor(sec % 60);
        if (d > 0) return d + 'd' + h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
        return h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    function rebuildCard(tag) {
        if (!el.cards) return;
        var oldCard = el.cards.querySelector('.account-card[data-tag="' + tag.replace(/"/g, '\\"') + '"]');
        if (!oldCard) return;
        var data = state.accounts[tag];
        if (!data) { oldCard.remove(); return; }
        var newCard = buildAccountCard(tag, data);
        oldCard.parentNode.replaceChild(newCard, oldCard);
    }

    // 数据变更后的统一刷新入口：time 排序需重排（renderCards），默认排序只重建单卡
    function refreshCard(tag) {
        if (sortMode === 'time') { renderCards(); } else { rebuildCard(tag); }
    }

    CocTool.overviewList = Object.freeze({ el: el, init: init, rebuildCard: rebuildCard, refreshCard: refreshCard, findThLevel: findThLevel });
})(window);
