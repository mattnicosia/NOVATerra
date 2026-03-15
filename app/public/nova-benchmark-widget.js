/**
 * NOVA Core Benchmark Widget v1.0
 * Embeddable construction cost benchmark widget
 *
 * Usage:
 * <script
 *   src="https://app-nova-42373ca7.vercel.app/nova-benchmark-widget.js"
 *   data-csi-code="03.300"
 *   data-api-key="nova_sk_..."
 *   data-metro="35620"
 *   data-container="nova-widget"
 * ></script>
 * <div id="nova-widget"></div>
 */
(function () {
  'use strict';
  var STYLES = [
    '.nova-widget{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    'background:#0D0D0F;border:1px solid rgba(255,255,255,0.08);border-radius:10px;',
    'padding:16px 20px;max-width:320px;color:#F0EDE8;box-sizing:border-box}',
    '.nova-widget *{box-sizing:border-box}',
    '.nova-widget-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
    '.nova-widget-brand{font-size:9px;font-weight:600;letter-spacing:0.1em;color:#4A4745;text-transform:uppercase}',
    '.nova-widget-flag{font-size:9px;font-weight:600;letter-spacing:0.06em;padding:2px 7px;',
    'border-radius:3px;text-transform:uppercase}',
    '.nova-widget-flag.market{background:rgba(61,158,107,0.15);color:#3D9E6B}',
    '.nova-widget-flag.indicative{background:rgba(186,117,23,0.15);color:#BA7517}',
    '.nova-widget-flag.insufficient_data{background:rgba(232,75,42,0.12);color:#E84B2A}',
    '.nova-widget-flag.national_fallback{background:rgba(90,87,85,0.15);color:#8A8580}',
    '.nova-widget-title{font-size:11px;color:#8A8580;margin-bottom:4px}',
    '.nova-widget-code{font-size:10px;font-family:monospace;color:#4A4745;margin-bottom:14px}',
    '.nova-widget-bars{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}',
    '.nova-widget-bar-row{display:flex;align-items:center;gap:8px}',
    '.nova-widget-bar-label{font-size:10px;color:#8A8580;width:28px;flex-shrink:0}',
    '.nova-widget-bar-track{flex:1;height:3px;background:#1E1E22;border-radius:2px;overflow:hidden;position:relative}',
    '.nova-widget-bar-fill{height:100%;border-radius:2px;position:absolute;transition:width 0.5s ease}',
    '.nova-widget-bar-val{font-size:11px;font-weight:600;color:#F0EDE8;width:52px;text-align:right;flex-shrink:0}',
    '.nova-widget-unit{font-size:9px;color:#4A4745;margin-left:2px;font-weight:400}',
    '.nova-widget-footer{display:flex;align-items:center;justify-content:space-between;',
    'border-top:1px solid rgba(255,255,255,0.05);padding-top:10px;margin-top:2px}',
    '.nova-widget-samples{font-size:9px;color:#4A4745}',
    '.nova-widget-link{font-size:9px;color:#E84B2A;text-decoration:none;font-weight:500}',
    '.nova-widget-link:hover{text-decoration:underline}',
    '.nova-widget-loading{display:flex;align-items:center;justify-content:center;',
    'min-height:80px;color:#4A4745;font-size:11px}',
    '.nova-widget-error{display:flex;align-items:center;justify-content:center;',
    'min-height:80px;color:#E84B2A;font-size:11px;text-align:center;padding:0 10px}'
  ].join('');
  function injectStyles() {
    if (document.getElementById('nova-widget-styles')) return;
    var style = document.createElement('style');
    style.id = 'nova-widget-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  function formatCurrency(val) {
    if (val == null || isNaN(val)) return '—';
    return '$' + Number(val).toFixed(2);
  }
  function getFlagLabel(flag) {
    var labels = {
      market: 'Market',
      indicative: 'Indicative',
      insufficient_data: 'Limited Data',
      national_fallback: 'National'
    };
    return labels[flag] || flag || '—';
  }
  function renderWidget(container, data) {
    var p10 = Number(data.p10);
    var p50 = Number(data.p50);
    var p90 = Number(data.p90);
    var max = p90 > 0 ? p90 : 1;
    var flag = data.display_flag || 'indicative';
    var unit = data.unit || '';
    container.innerHTML = [
      '<div class="nova-widget">',
        '<div class="nova-widget-header">',
          '<span class="nova-widget-brand">NOVA Core</span>',
          '<span class="nova-widget-flag ' + flag + '">' + getFlagLabel(flag) + '</span>',
        '</div>',
        '<div class="nova-widget-title">' + (data.csi_title || 'Scope Item') + '</div>',
        '<div class="nova-widget-code">' + (data.csi_code || '') + (unit ? ' &nbsp;&middot;&nbsp; ' + unit : '') + '</div>',
        '<div class="nova-widget-bars">',
          '<div class="nova-widget-bar-row">',
            '<div class="nova-widget-bar-label">P10</div>',
            '<div class="nova-widget-bar-track">',
              '<div class="nova-widget-bar-fill" style="width:' + (p10/max*100).toFixed(1) + '%;background:#534AB7"></div>',
            '</div>',
            '<div class="nova-widget-bar-val">' + formatCurrency(p10) + '<span class="nova-widget-unit">/' + unit + '</span></div>',
          '</div>',
          '<div class="nova-widget-bar-row">',
            '<div class="nova-widget-bar-label">P50</div>',
            '<div class="nova-widget-bar-track">',
              '<div class="nova-widget-bar-fill" style="width:' + (p50/max*100).toFixed(1) + '%;background:#E84B2A"></div>',
            '</div>',
            '<div class="nova-widget-bar-val">' + formatCurrency(p50) + '<span class="nova-widget-unit">/' + unit + '</span></div>',
          '</div>',
          '<div class="nova-widget-bar-row">',
            '<div class="nova-widget-bar-label">P90</div>',
            '<div class="nova-widget-bar-track">',
              '<div class="nova-widget-bar-fill" style="width:100%;background:#3D9E6B"></div>',
            '</div>',
            '<div class="nova-widget-bar-val">' + formatCurrency(p90) + '<span class="nova-widget-unit">/' + unit + '</span></div>',
          '</div>',
        '</div>',
        '<div class="nova-widget-footer">',
          '<span class="nova-widget-samples">' + (data.sample_count || 0) + ' data point' + (data.sample_count === 1 ? '' : 's') + ' &nbsp;&middot;&nbsp; ' + (data.state || 'National') + '</span>',
          '<a class="nova-widget-link" href="https://novaterra.ai" target="_blank" rel="noopener">NOVA Core &nearr;</a>',
        '</div>',
      '</div>'
    ].join('');
  }
  function renderLoading(container) {
    container.innerHTML = '<div class="nova-widget"><div class="nova-widget-loading">Loading benchmark...</div></div>';
  }
  function renderError(container, msg) {
    container.innerHTML = '<div class="nova-widget"><div class="nova-widget-error">' + (msg || 'Unable to load benchmark data') + '</div></div>';
  }
  function init() {
    injectStyles();
    var scripts = document.querySelectorAll('script[data-csi-code]');
    for (var i = 0; i < scripts.length; i++) {
      (function (script) {
        var csiCode = script.getAttribute('data-csi-code');
        var apiKey = script.getAttribute('data-api-key');
        var metro = script.getAttribute('data-metro');
        var buildingType = script.getAttribute('data-building-type');
        var containerId = script.getAttribute('data-container');
        var apiBase = script.getAttribute('data-api-base') || 'https://app-nova-42373ca7.vercel.app';
        if (!csiCode || !apiKey) return;
        var container = containerId
          ? document.getElementById(containerId)
          : (function () {
              var el = document.createElement('div');
              script.parentNode.insertBefore(el, script.nextSibling);
              return el;
            })();
        if (!container) return;
        renderLoading(container);
        var url = apiBase + '/api/v1/benchmark?csi_code=' + encodeURIComponent(csiCode);
        if (metro) url += '&metro=' + encodeURIComponent(metro);
        if (buildingType) url += '&building_type=' + encodeURIComponent(buildingType);
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + apiKey);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.timeout = 8000;
        xhr.onload = function () {
          if (xhr.status === 200) {
            try {
              var data = JSON.parse(xhr.responseText);
              renderWidget(container, data);
            } catch (e) {
              renderError(container, 'Invalid response from NOVA Core');
            }
          } else if (xhr.status === 404) {
            renderError(container, 'CSI code not found: ' + csiCode);
          } else if (xhr.status === 401) {
            renderError(container, 'Invalid API key');
          } else if (xhr.status === 429) {
            renderError(container, 'Rate limit exceeded');
          } else {
            renderError(container, 'NOVA Core unavailable');
          }
        };
        xhr.onerror = function () { renderError(container, 'Network error'); };
        xhr.ontimeout = function () { renderError(container, 'Request timed out'); };
        xhr.send();
      })(scripts[i]);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
