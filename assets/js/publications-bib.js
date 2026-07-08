(function () {
  'use strict';

  var BIB_PATH = '/assets/bib/publications.bib';
  var AUTHOR_LINKS_PATH = '/assets/data/author-links.json';
  var LAB_MEMBER_NAMES = ['Xi Tan'];
  var MONTH_MAP = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  };

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanupValue(value) {
    if (!value) {
      return '';
    }

    var trimmed = String(value).trim();
    if ((trimmed[0] === '{' && trimmed[trimmed.length - 1] === '}') ||
        (trimmed[0] === '"' && trimmed[trimmed.length - 1] === '"')) {
      trimmed = trimmed.slice(1, -1);
    }

    return trimmed
      .replace(/[{}]/g, '')
      .replace(/\\&/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findMatching(text, startIndex, openChar, closeChar) {
    var depth = 0;
    var inQuotes = false;

    for (var i = startIndex; i < text.length; i += 1) {
      var ch = text[i];
      var prev = i > 0 ? text[i - 1] : '';

      if (ch === '"' && prev !== '\\') {
        inQuotes = !inQuotes;
      }

      if (inQuotes) {
        continue;
      }

      if (ch === openChar) {
        depth += 1;
      } else if (ch === closeChar) {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  function parseFields(fieldText) {
    var fields = {};
    var i = 0;

    while (i < fieldText.length) {
      while (i < fieldText.length && /[\s,]/.test(fieldText[i])) {
        i += 1;
      }

      if (i >= fieldText.length) {
        break;
      }

      var nameStart = i;
      while (i < fieldText.length && /[A-Za-z0-9_\-]/.test(fieldText[i])) {
        i += 1;
      }
      var rawName = fieldText.slice(nameStart, i).trim();
      if (!rawName) {
        break;
      }

      while (i < fieldText.length && /\s/.test(fieldText[i])) {
        i += 1;
      }

      if (fieldText[i] !== '=') {
        while (i < fieldText.length && fieldText[i] !== ',') {
          i += 1;
        }
        continue;
      }
      i += 1;

      while (i < fieldText.length && /\s/.test(fieldText[i])) {
        i += 1;
      }

      var rawValue = '';
      if (fieldText[i] === '{') {
        var braceEnd = findMatching(fieldText, i, '{', '}');
        if (braceEnd === -1) {
          break;
        }
        rawValue = fieldText.slice(i, braceEnd + 1);
        i = braceEnd + 1;
      } else if (fieldText[i] === '"') {
        var quoteEnd = i + 1;
        while (quoteEnd < fieldText.length) {
          if (fieldText[quoteEnd] === '"' && fieldText[quoteEnd - 1] !== '\\') {
            break;
          }
          quoteEnd += 1;
        }
        rawValue = fieldText.slice(i, quoteEnd + 1);
        i = quoteEnd + 1;
      } else {
        var valueStart = i;
        while (i < fieldText.length && fieldText[i] !== ',') {
          i += 1;
        }
        rawValue = fieldText.slice(valueStart, i);
      }

      fields[rawName.toLowerCase()] = cleanupValue(rawValue);
    }

    return fields;
  }

  function parseBibTeX(text) {
    var entries = [];
    var i = 0;

    while (i < text.length) {
      var at = text.indexOf('@', i);
      if (at === -1) {
        break;
      }

      var typeStart = at + 1;
      var typeEnd = typeStart;
      while (typeEnd < text.length && /[A-Za-z]/.test(text[typeEnd])) {
        typeEnd += 1;
      }

      var entryType = text.slice(typeStart, typeEnd).toLowerCase();
      while (typeEnd < text.length && /\s/.test(text[typeEnd])) {
        typeEnd += 1;
      }

      var openChar = text[typeEnd];
      if (openChar !== '{' && openChar !== '(') {
        i = typeEnd + 1;
        continue;
      }

      var closeChar = openChar === '{' ? '}' : ')';
      var entryEnd = findMatching(text, typeEnd, openChar, closeChar);
      if (entryEnd === -1) {
        break;
      }

      var body = text.slice(typeEnd + 1, entryEnd).trim();
      var firstComma = body.indexOf(',');
      if (firstComma === -1) {
        i = entryEnd + 1;
        continue;
      }

      var citationKey = body.slice(0, firstComma).trim();
      var fieldText = body.slice(firstComma + 1);
      var fields = parseFields(fieldText);

      entries.push({
        entryType: entryType,
        citationKey: citationKey,
        fields: fields
      });

      i = entryEnd + 1;
    }

    return entries;
  }

  function parseYear(fields) {
    var year = parseInt(fields.year, 10);
    if (!Number.isNaN(year)) {
      return year;
    }

    if (fields.date && /^\d{4}/.test(fields.date)) {
      return parseInt(fields.date.slice(0, 4), 10);
    }

    return 0;
  }

  function parseMonth(fields) {
    if (fields.month) {
      var month = fields.month.toLowerCase();
      if (MONTH_MAP[month]) {
        return MONTH_MAP[month];
      }
      var monthNum = parseInt(month, 10);
      if (!Number.isNaN(monthNum)) {
        return monthNum;
      }
    }

    if (fields.date && /^\d{4}-\d{2}/.test(fields.date)) {
      return parseInt(fields.date.slice(5, 7), 10);
    }

    return 0;
  }

  function splitAuthors(authorField) {
    if (!authorField) {
      return [];
    }
    return authorField.split(/\s+and\s+/i).map(function (name) {
      return name.trim();
    }).filter(Boolean);
  }

  function normalizeAuthorKey(name) {
    return String(name || '')
      .replace(/\*/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildAuthorLinkMap(rawLinks) {
    var map = {};
    if (!rawLinks || typeof rawLinks !== 'object') {
      return map;
    }

    Object.keys(rawLinks).forEach(function (name) {
      var key = normalizeAuthorKey(name);
      if (key) {
        map[key] = String(rawLinks[name] || '').trim();
      }
    });

    return map;
  }

  function normalizePersonName(name) {
    var clean = cleanupValue(name);
    if (clean.indexOf(',') !== -1) {
      var parts = clean.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      if (parts.length >= 2) {
        return parts.slice(1).join(' ') + ' ' + parts[0];
      }
    }
    return clean;
  }

  function isLabMember(name) {
    var normalized = name.replace(/\*/g, '').trim().toLowerCase();
    return LAB_MEMBER_NAMES.some(function (member) {
      return member.toLowerCase() === normalized;
    });
  }

  function renderAuthors(fields, authorLinkMap) {
    var names = splitAuthors(fields.author).map(normalizePersonName);
    if (names.length === 0) {
      return '';
    }

    var htmlNames = names.map(function (name, index) {
      var safeName = escapeHtml(name);
      if (isLabMember(name)) {
        safeName = '<strong>' + safeName + '</strong>';
      }

      var key = normalizeAuthorKey(name);
      var authorUrl = (authorLinkMap && authorLinkMap[key]) ? authorLinkMap[key] : '';
      if (authorUrl) {
        safeName = '<a href="' + escapeHtml(authorUrl) + '" target="_blank" rel="noopener">' + safeName + '</a>';
      }

      return '<nobr>' + safeName + '</nobr>';
    });

    if (htmlNames.length === 1) {
      return htmlNames[0] + '.';
    }

    if (htmlNames.length === 2) {
      return htmlNames[0] + ' and ' + htmlNames[1] + '.';
    }

    return htmlNames.slice(0, -1).join(', ') + ', and ' + htmlNames[htmlNames.length - 1] + '.';
  }

  function buildVenueText(entry) {
    var fields = entry.fields;
    if (fields.display_venue) {
      return fields.display_venue;
    }

    var venue = fields.venue || fields.booktitle || fields.journal || fields.publisher || '';
    if (!venue) {
      return entry.year ? String(entry.year) : '';
    }

    return entry.year ? ('In ' + venue + ', ' + entry.year) : venue;
  }

  function renderLinkBadge(url, label) {
    if (!url) {
      return '';
    }

    return '<a class="badge grey waves-effect font-weight-light mr-1" href="' +
      escapeHtml(url) + '" target="_blank" rel="noopener">' + label + '</a>';
  }

  function renderEntry(entry, authorLinkMap) {
    var f = entry.fields;
    var abbr = f.abbr || '';
    var venueUrl = f.venue_url || f.url || '';
    var badge = '';

    if (abbr) {
      var tag = '<span class="badge font-weight-bold light-blue darken-1 align-middle" style="width: 65px;">' +
        escapeHtml(abbr) + '</span>';
      if (venueUrl) {
        tag = '<a class="badge font-weight-bold light-blue darken-1 align-middle" style="width: 65px;" href="' +
          escapeHtml(venueUrl) + '" target="_blank" rel="noopener">' + escapeHtml(abbr) + '</a>';
      }
      badge = tag;
    }

    var title = escapeHtml(f.title || '(Untitled)');
    var authors = renderAuthors(f, authorLinkMap);
    var venueText = escapeHtml(buildVenueText(entry));
    var abstractId = 'abs-' + escapeHtml(entry.citationKey || Math.random().toString(36).slice(2));

    var links = '';
    links += renderLinkBadge(f.pdf, 'PDF');
    links += renderLinkBadge(f.code, 'Code');
    links += renderLinkBadge(f.slides, 'Slides');
    links += renderLinkBadge(f.poster, 'Poster');
    links += renderLinkBadge(f.ae, 'AE');
    links += renderLinkBadge(f.project, 'Project');

    if (f.abstract) {
      links = '<a class="badge grey waves-effect font-weight-light mr-1" data-toggle="collapse" href="#' +
        abstractId + '" role="button" aria-expanded="false" aria-controls="' + abstractId + '">Abstract</a>' + links;
    }

    var abstractHtml = '';
    if (f.abstract) {
      abstractHtml = '<div class="col mt-2 p-0">' +
        '<div id="' + abstractId + '" class="collapse">' +
        '<div class="abstract card card-body font-weight-light mr-0 mr-sm-3 p-3">' +
        escapeHtml(f.abstract) +
        '</div></div></div>';
    }

    return '' +
      '<li>' +
      '<div class="row m-0 mt-3 p-0">' +
      '<div class="col-sm-1 p-0 abbr">' + badge + '</div>' +
      '<div class="col-sm-11 mt-2 mt-sm-0 p-0 pl-xs-0 pl-sm-4 pr-xs-0 pr-sm-2">' +
      '<div id="' + escapeHtml(entry.citationKey || '') + '" class="col p-0">' +
      '<h5 class="title mb-0">' + title + '</h5>' +
      '<div class="author">' + authors + '</div>' +
      '<div><p class="periodical font-italic">' + venueText + '</p></div>' +
      '<div class="col p-0">' + links + '</div>' +
      abstractHtml +
      '</div></div></div></li>';
  }

  function renderGrouped(entries, authorLinkMap) {
    var groups = {};

    entries.forEach(function (entry) {
      var year = entry.year || 0;
      if (!groups[year]) {
        groups[year] = [];
      }
      groups[year].push(entry);
    });

    var years = Object.keys(groups).map(function (y) { return parseInt(y, 10); }).sort(function (a, b) {
      return b - a;
    });

    var html = '';
    years.forEach(function (year) {
      html += '' +
        '<div class="row m-0 p-0" style="border-top: 1px solid #ddd; flex-direction: row-reverse;">' +
        '<div class="col-sm-1 mt-2 p-0 pr-1">' +
        '<h3 class="bibliography-year">' + escapeHtml(String(year)) + '</h3>' +
        '</div>' +
        '<div class="col-sm-11 p-0">' +
        '<ol class="bibliography">' +
        groups[year].map(function (entry) {
          return renderEntry(entry, authorLinkMap);
        }).join('') +
        '</ol></div></div>';
    });

    return html;
  }

  function normalizeSearchText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildEntrySearchText(entry) {
    var f = entry.fields || {};
    var parts = [];
    parts.push(f.title || '');
    parts.push(f.author || '');
    parts.push(f.booktitle || '');
    parts.push(f.journal || '');
    parts.push(f.venue || '');
    parts.push(f.display_venue || '');
    parts.push(f.abbr || '');
    parts.push(String(entry.year || ''));
    return normalizeSearchText(parts.join(' '));
  }

  function filterEntries(entries, query) {
    var normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
      return entries;
    }

    return entries.filter(function (entry) {
      return buildEntrySearchText(entry).indexOf(normalizedQuery) !== -1;
    });
  }

  function updateSearchStatus(statusElement, filteredCount, totalCount, query) {
    if (!statusElement) {
      return;
    }

    var hasQuery = normalizeSearchText(query).length > 0;
    if (!hasQuery) {
      statusElement.textContent = 'Showing all ' + totalCount + ' publications.';
      return;
    }

    statusElement.textContent = 'Showing ' + filteredCount + ' of ' + totalCount + ' publications.';
  }

  function prepareEntries(rawEntries) {
    return rawEntries
      .filter(function (entry) {
        return entry.entryType !== 'comment';
      })
      .map(function (entry) {
        entry.year = parseYear(entry.fields);
        entry.month = parseMonth(entry.fields);
        return entry;
      })
      .filter(function (entry) {
        return entry.year > 0;
      })
      .sort(function (a, b) {
        if (b.year !== a.year) {
          return b.year - a.year;
        }
        if (b.month !== a.month) {
          return b.month - a.month;
        }
        return (a.fields.title || '').localeCompare(b.fields.title || '');
      });
  }

  function renderError(message) {
    var container = document.getElementById('publications-container');
    if (!container) {
      return;
    }
    container.innerHTML = '<p style="color: #b00020;">' + escapeHtml(message) + '</p>';
  }

  function renderEmptyResult(container, query) {
    container.innerHTML = '<p>No publications matched "' + escapeHtml(query) + '".</p>';
  }

  function attachSearch(entries, authorLinkMap, container) {
    var input = document.getElementById('publications-search');
    var clearButton = document.getElementById('publications-search-clear');
    var status = document.getElementById('publications-search-status');
    var total = entries.length;

    function renderByQuery() {
      var query = input ? input.value : '';
      var filtered = filterEntries(entries, query);

      if (filtered.length === 0) {
        renderEmptyResult(container, query);
      } else {
        container.innerHTML = renderGrouped(filtered, authorLinkMap);
      }
      updateSearchStatus(status, filtered.length, total, query);
      return filtered.length;
    }

    if (input) {
      input.addEventListener('input', renderByQuery);
      input.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') {
          return;
        }

        event.preventDefault();
        var count = renderByQuery();
        if (count <= 0) {
          return;
        }

        var firstResultTitle = container.querySelector('h5.title');
        if (firstResultTitle && typeof firstResultTitle.scrollIntoView === 'function') {
          firstResultTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', function () {
        if (input) {
          input.value = '';
          input.focus();
        }
        renderByQuery();
      });
    }

    renderByQuery();
  }

  function main() {
    var container = document.getElementById('publications-container');
    if (!container) {
      return;
    }

    var bibPromise = fetch(BIB_PATH)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load bib file: ' + response.status);
        }
        return response.text();
      });

    // Keep author links optional: if the JSON file is missing, render plain names.
    var authorLinksPromise = fetch(AUTHOR_LINKS_PATH)
      .then(function (response) {
        if (!response.ok) {
          return {};
        }
        return response.json();
      })
      .catch(function () {
        return {};
      });

    Promise.all([bibPromise, authorLinksPromise])
      .then(function (result) {
        var bibText = result[0];
        var authorLinks = result[1];
        var authorLinkMap = buildAuthorLinkMap(authorLinks);
        var entries = prepareEntries(parseBibTeX(bibText));
        if (entries.length === 0) {
          container.innerHTML = '<p>No publications found in bib file.</p>';
          return;
        }
        attachSearch(entries, authorLinkMap, container);
      })
      .catch(function (err) {
        renderError(err.message);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
