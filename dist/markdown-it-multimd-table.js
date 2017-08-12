/*! markdown-it-multimd-table 1.0.0 https://github.com//markdown-it/markdown-it-multimd-table @license MIT */(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.markdownitDeflist = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// Process definition lists
//
'use strict';

module.exports = function multimd_table_plugin(md) {
  function isFilledArray(array) {
    return typeof array !== 'undefined' && array.length > 0;
  }

  function getLine(state, line) {
    var pos = state.bMarks[line] + state.blkIndent,
      max = state.eMarks[line];

    return state.src.slice(pos, max);
  }

  function escapedSplit(str) {
    var result = [],
      pos = 0,
      max = str.length,
      escapes = 0,
      lastPos = 0,
      backTicked = false,
      lastBackTick = 0;

    while (pos < max) {
      switch (str.charCodeAt(pos)) {
        case 0x5c/* \ */:
          escapes++;
          break;
        case 0x60/* ` */:
          if (backTicked || ((escapes & 1) === 0)) {
            // make \` close code sequence, but not open it;
            // the reason is: `\` is correct code block
            backTicked = !backTicked;
            lastBackTick = pos;
          }
          escapes = 0;
          break;
        case 0x7c/* | */:
          if ((escapes & 1) === 0 && !backTicked) {
            result.push(str.slice(lastPos, pos));
            lastPos = pos + 1;
          }
          escapes = 0;
          break;
        default:
          escapes = 0;
          break;
      }

      pos++;

      // If there was an un-closed backtick, go back to just after
      // the last backtick, but as if it was a normal character
      if (pos === max && backTicked) {
        backTicked = false;
        pos = lastBackTick + 1;
      }
    }

    result.push(str.slice(lastPos));

    return result;
  }

  function countColspan(columns) {
    var i, emptyCount, colspans;

    emptyCount = 0;
    colspans = [];
    for (i = columns.length - 1; i >= 0; i--) {
      if (columns[i]) {
        colspans.unshift(emptyCount + 1);
        emptyCount = 0;
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) {
      colspans.unshift(emptyCount + 1);
    }

    return colspans;
  }

  function table(state, startLine, endLine, silent, captionInfo) {
    var lineText, i, col, captionLine, headerLine, seperatorLine, nextLine,
      columns, columnCount, token, aligns, wraps, colspans, t, tableLines,
      tbodyLines, emptyTableBody;

    // should have at least two lines
    if (startLine + 2 > endLine) { return false; }

    seperatorLine = startLine + 1;
    if (state.sCount[seperatorLine] < state.blkIndent) { return false; }
    // if it's indented more than 3 spaces, it should be a code block
    if (state.sCount[seperatorLine] - state.blkIndent >= 4) { return false; }

    while (!isFilledArray(aligns)) {
      lineText = getLine(state, seperatorLine);
      columns = lineText.split('|');
      if (columns.length === 1 && !/^\||[^\\]\|$/.test(lineText)) { return false; }
      aligns = [];
      wraps = [];
      for (i = 0; i < columns.length; i++) {
        t = columns[i].trim();
        if (!t && (i === 0 || i === columns.length - 1)) {
          continue;
        } else if (!/^:?(-+|=+):?\+?$/.test(t)) {
          // might be another header line, so initialize
          seperatorLine++;
          aligns = [];
          wraps = [];
          break;
        }

        // pushed as wraps[i]
        wraps.push(t.charCodeAt(t.length - 1) === 0x2B/* + */);
        if (wraps[i]) { t = t.slice(0, -1); }

        switch (((t.charCodeAt(0)            === 0x3A/* : */) << 4) +
             (t.charCodeAt(t.length - 1) === 0x3A/* : */)) {
          case 0x00: aligns.push('');       break;
          case 0x01: aligns.push('right');  break;
          case 0x10: aligns.push('left');   break;
          case 0x11: aligns.push('center'); break;
        }
      }
    }

    for (headerLine = startLine; headerLine < seperatorLine; headerLine++) {
      lineText = getLine(state, headerLine).trim();
      if (lineText.indexOf('|') === -1) { return false; }
      if (state.sCount[startLine] - state.blkIndent >= 4) { return false; }

      // header row will define an amount of columns in the entire table,
      // and align row shouldn't be smaller than that (the rest of the rows can)
      columnCount = escapedSplit(lineText.replace(/^\||\|$/g, '')).length;
      if (columnCount > aligns.length) { return false; }
      if (columnCount === 1 && !/^\||[^\\]\|$/.test(lineText)) { return false; }
    }

    if (silent) { return true; }

    token     = state.push('table_open', 'table', 1);
    token.map = tableLines = [ startLine, 0 ];

    if (captionInfo[0]) {
      captionLine = (captionInfo[2] & 0x10) ? startLine - 1 : endLine + 1;

      token          = state.push('caption_open', 'caption', 1);
      token.map      = [ captionLine, captionLine + 1 ];
      token.attrs    = [ [ 'id', captionInfo[1].toLowerCase().replace(/\W+/g, '') ] ];

      token          = state.push('inline', '', 0);
      token.content  = captionInfo[0];
      token.map      = [ captionLine, captionLine + 1 ];
      token.children = [];

      token         = state.push('caption_close', 'caption', -1);
    }

    token     = state.push('thead_open', 'thead', 1);
    token.map = [ startLine, seperatorLine - 1 ];

    for (headerLine = startLine; headerLine < seperatorLine; headerLine++) {
      lineText = getLine(state, headerLine).trim();
      columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));
      colspans = countColspan(columns);

      token     = state.push('tr_open', 'tr', 1);
      token.map = [ startLine, startLine + 1 ];

      for (i = 0, col = 0; col < columns.length; i++) {
        token          = state.push('th_open', 'th', 1);
        token.map      = [ headerLine, headerLine + 1 ];
        token.attrs    = [];
        if (aligns[col]) { token.attrs.push([ 'style', 'text-align:' + aligns[col] ]); }
        if (wraps[col]) { token.attrs.push([ 'class', 'extend' ]); }
        if (colspans[i] > 1) { token.attrs.push([ 'colspan', colspans[i] ]); }

        token          = state.push('inline', '', 0);
        token.content  = columns[i].trim();
        token.map      = [ headerLine, headerLine + 1 ];
        token.children = [];

        token          = state.push('th_close', 'th', -1);

        col += colspans[i] || 1;
      }

      token     = state.push('tr_close', 'tr', -1);
    }

    token     = state.push('thead_close', 'thead', -1);

    token     = state.push('tbody_open', 'tbody', 1);
    token.map = tbodyLines = [ seperatorLine + 1, 0 ];

    emptyTableBody = true;

    for (nextLine = seperatorLine + 1; nextLine < endLine; nextLine++) {
      if (state.sCount[nextLine] < state.blkIndent) { break; }

      lineText = getLine(state, nextLine).trim();

      // HACK: avoid outer while loop
      if (!lineText && !emptyTableBody) {
        tbodyLines[1] = nextLine - 1;
        token     = state.push('tbody_close', 'tbody', -1);
        token     = state.push('tbody_open', 'tbody', 1);
        token.map = tbodyLines = [ nextLine + 1, 0 ];
        emptyTableBody = true;
        continue;
      } else if (!lineText) {
        break;
      }

      if (lineText.indexOf('|') === -1) { break; }
      if (state.sCount[nextLine] - state.blkIndent >= 4) { break; }
      columns = escapedSplit(lineText.replace(/^\||\|$/g, ''));
      if (columns.length === 1 && !/^\||[^\\]\|$/.test(lineText)) { break; }
      colspans = countColspan(columns);

      emptyTableBody = false;

      token = state.push('tr_open', 'tr', 1);
      for (i = 0, col = 0; col < columnCount; i++) {
        token          = state.push('td_open', 'td', 1);
        token.attrs    = [];
        if (aligns[col]) { token.attrs.push([ 'style', 'text-align:' + aligns[col] ]); }
        if (wraps[col]) { token.attrs.push([ 'class', 'extend' ]); }
        if (colspans[i] > 1) { token.attrs.push([ 'colspan', colspans[i] ]); }

        token          = state.push('inline', '', 0);
        token.content  = columns[i] ? columns[i].trim() : '';
        token.children = [];

        token          = state.push('td_close', 'td', -1);

        col += colspans[i] || 1;
      }
      token = state.push('tr_close', 'tr', -1);
    }
    token = state.push('tbody_close', 'tbody', -1);
    token = state.push('table_close', 'table', -1);

    tableLines[1] = tbodyLines[1] = nextLine;
    state.line = nextLine;
    return true;
  }

  function tableWithCaption(state, startLine, endLine, silent) {
    var lineText, result, captionInfo;

    // captionInfo: [ caption, label, captionLinePos ]
    captionInfo = [ null, null, 0 ];

    lineText = getLine(state, endLine - 1);
    result = lineText.match(/^\[([^[\]]+)\](\[([^[\]]+)\])?\s*$/);
    if (result) {
      captionInfo = [ result[1],
              result[2] || result[1],
              captionInfo[2] | 0x01 ];
    }

    lineText = getLine(state, startLine);
    result = lineText.match(/^\[([^[\]]+)\](\[([^[\]]+)\])?\s*$/);
    if (result) {
      captionInfo = [ result[1],
              result[2] || result[1],
              captionInfo[2] | 0x10 ];
    }

    result = table(state,
            startLine + ((captionInfo[2] & 0x10) === 0x10),
            endLine   - ((captionInfo[2] & 0x01) === 0x01),
            silent, captionInfo);
    if (result && !silent) {
      state.line += (captionInfo[2] & 0x01);
    }

    return result;
  }

  md.block.ruler.at('table', tableWithCaption, { alt: [ 'paragraph', 'reference' ] });
};

},{}]},{},[1])(1)
});