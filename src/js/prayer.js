/*
 * Namaz vakitleri (prayer times) for Home and the screen saver, from Fazilet Takvimi.
 *
 * The district comes from js/config.js (prayer.districtId) and defaults to null, which disables
 * the widget entirely. Ids are Fazilet's own: Netherlands is country 40, and its cities are listed
 * by https://fazilettakvimi.com/api/cms/cities-by-country?districtId=40 (Rotterdam is 570).
 *
 * The daily endpoint returns today and the next two days, with every time as a UTC instant, so
 * the TV's own clock and time zone do the conversion. Like the weather there is no polling of
 * the network: whoever is about to show the times calls refresh(), and it only asks again when
 * the cached days no longer cover tomorrow, or after a few hours. The cache lives in localStorage
 * so Home opens with real times even when the TV has just been switched on.
 */
(function () {
    'use strict';

    var STORE_KEY = 'arn0.prayer.v1';
    // The backend sends no CORS headers, so the browser preview goes through scripts/serve.mjs.
    var ENDPOINT = window.__TIZEN_MOCK__ ? '/fazilet' : 'https://backend.fazilettakvimi.com/content/public';
    var FRESH_MS = 6 * 60 * 60 * 1000;
    var TIMEOUT_MS = 8000;
    var RETRY_MS = 10 * 60 * 1000;          // quiet period after a failed attempt

    // Fazilet's own order. `israk` exists in the response but is empty for most districts.
    var TIMES = [
        { key: 'imsak', label: 'İmsak' },
        { key: 'sabah', label: 'Sabah' },
        { key: 'gunes', label: 'Güneş' },
        { key: 'ogle', label: 'Öğle' },
        { key: 'ikindi', label: 'İkindi' },
        { key: 'aksam', label: 'Akşam' },
        { key: 'yatsi', label: 'Yatsı' }
    ];

    // ---------- Configuration

    function cfg() {
        return (window.LAUNCHER_CONFIG && window.LAUNCHER_CONFIG.prayer) || {};
    }

    function configured() {
        var id = cfg().districtId;
        return typeof id === 'number' || (typeof id === 'string' && id !== '');
    }

    // ---------- Cache

    var reading = null;
    var fetching = false;
    var lastFailure = 0;
    var listeners = [];

    function load() {
        try {
            reading = JSON.parse(localStorage.getItem(STORE_KEY));
        } catch (e) {
            reading = null;
        }
        // A different district in config.js makes the cached times someone else's.
        if (reading && String(reading.districtId) !== String(cfg().districtId)) reading = null;
    }

    function store() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(reading));
        } catch (e) {
            // Without the cache we only lose the instant first paint.
        }
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    // Local calendar day, matching the `tarih` keys in the response.
    function dayKey(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function dayOf(key) {
        if (!reading || !reading.days) return null;
        return reading.days.find(function (day) { return day.date === key; }) || null;
    }

    function tomorrowKey(now) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        return dayKey(d);
    }

    // ---------- Reading

    function hoursMinutes(ms) {
        var mins = Math.max(1, Math.ceil(ms / 60000));
        var h = Math.floor(mins / 60);
        var m = mins % 60;
        if (!h) return m + ' dk';
        return h + ' sa' + (m ? ' ' + m + ' dk' : '');
    }

    /*
     * The day shown is the one holding the next prayer, so after Yatsı the row already reads
     * tomorrow. Returns null without a cached today: times for the wrong day are worse than none.
     */
    function current() {
        if (!configured()) return null;
        var now = new Date();
        var today = dayOf(dayKey(now));
        if (!today) return null;
        var t = now.getTime();
        var day = today;
        var next = TIMES.find(function (p) { return today.times[p.key] > t; });
        if (!next) {
            var tomorrow = dayOf(tomorrowKey(now));
            if (tomorrow) {
                day = tomorrow;
                next = TIMES[0];
            }
        }
        var rows = TIMES.map(function (p) {
            var at = day.times[p.key];
            return {
                key: p.key,
                label: p.label,
                time: at ? Appearance.time(new Date(at)).time : '–',
                past: !at || at <= t,
                next: next === p
            };
        });
        return {
            region: reading.region,
            hijri: day.hijri,
            rows: rows,
            next: next ? {
                label: next.label,
                time: Appearance.time(new Date(day.times[next.key])).time,
                remaining: hoursMinutes(day.times[next.key] - t)
            } : null
        };
    }

    // ---------- Fetching

    function url() {
        return ENDPOINT + '/daily?districtId=' + encodeURIComponent(cfg().districtId) + '&lang=tr';
    }

    function instant(list) {
        var first = list && list[0];
        var ms = first ? Date.parse(first.tarih) : NaN;
        return isNaN(ms) ? null : ms;
    }

    function accept(data) {
        if (!data || !data.success || !data.vakitler || !data.vakitler.length) return false;
        var hijri = {};
        (data.takvimler || []).forEach(function (c) { hijri[c.tarih] = c.hicri_tarih; });
        var days = data.vakitler.map(function (v) {
            var times = {};
            TIMES.forEach(function (p) { times[p.key] = instant(v[p.key]); });
            return { date: v.tarih, hijri: hijri[v.tarih] || '', times: times };
        });
        reading = {
            at: Date.now(),
            districtId: cfg().districtId,
            region: data.bolge_adi || '',
            days: days
        };
        store();
        listeners.forEach(function (fn) { fn(); });
        return true;
    }

    function due() {
        if (!reading || !reading.at) return true;
        if (Date.now() - reading.at > FRESH_MS) return true;
        // Tomorrow is needed for the countdown to İmsak once Yatsı has passed.
        return !dayOf(tomorrowKey(new Date()));
    }

    function failed(why) {
        fetching = false;
        lastFailure = Date.now();
        DevLog.log('Prayer times: ' + why);
    }

    // force: ignore both rules (the Lab entry).
    function refresh(force) {
        if (!configured() || fetching) return;
        if (!force && !due()) return;
        if (!force && Date.now() - lastFailure < RETRY_MS) return;
        fetching = true;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url(), true);
        xhr.timeout = TIMEOUT_MS;
        xhr.onload = function () {
            var ok = false;
            try {
                ok = xhr.status >= 200 && xhr.status < 300 && accept(JSON.parse(xhr.responseText));
            } catch (e) {
                ok = false;
            }
            if (ok) {
                fetching = false;
                lastFailure = 0;
            } else {
                failed('unusable response (HTTP ' + xhr.status + ')');
            }
        };
        xhr.onerror = function () { failed('request failed'); };
        xhr.ontimeout = function () { failed('request timed out'); };
        xhr.send();
    }

    function start() {
        load();
        if (!configured()) {
            DevLog.log('Prayer times off: set prayer.districtId in js/config.js');
            return;
        }
        refresh();
    }

    window.Prayer = {
        start: start,
        refresh: refresh,
        current: current,
        configured: configured,
        onUpdate: function (fn) { listeners.push(fn); },
        actions: function () {
            return [{
                label: 'Prayer times: fetch now and log the reading',
                run: function () {
                    if (!configured()) {
                        UI.toast('No prayer.districtId in config.js');
                        return;
                    }
                    DevLog.log('Prayer times: requesting ' + url());
                    var once = function () {
                        DevLog.log('Prayer times: ' + JSON.stringify(reading));
                        UI.toast('Prayer times updated');
                    };
                    listeners.push(once);
                    refresh(true);
                }
            }];
        }
    };
})();
