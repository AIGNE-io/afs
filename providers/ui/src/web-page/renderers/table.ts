export const TABLE_JS = `
  function renderAupTable(node) {
    var p = node.props || {};
    var columns = Array.isArray(p.columns) ? p.columns : [];
    var rows = Array.isArray(p.rows) ? p.rows : [];

    var table = document.createElement("table");
    table.className = "aup-table";

    // Header
    var thead = document.createElement("thead");
    var headerRow = document.createElement("tr");
    for (var c = 0; c < columns.length; c++) {
      var th = document.createElement("th");
      var col = columns[c];
      th.textContent = _escapeHtml(String(col.label || col.key || ""));
      if (col.align) th.setAttribute("data-align", col.align);
      // Sort click event
      (function(colKey) {
        th.onclick = function() {
          if (node.events && node.events.sort) {
            _fireAupEvent(node.id, "sort", {});
          }
        };
      })(col.key);
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    var tbody = document.createElement("tbody");
    if (rows.length === 0) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.className = "aup-table-empty";
      emptyCell.colSpan = columns.length || 1;
      emptyCell.textContent = "No data";
      emptyRow.appendChild(emptyCell);
      tbody.appendChild(emptyRow);
    } else {
      for (var r = 0; r < rows.length; r++) {
        var tr = document.createElement("tr");
        var row = rows[r];
        for (var ci = 0; ci < columns.length; ci++) {
          var td = document.createElement("td");
          var colDef = columns[ci];
          var cellVal = row[colDef.key];
          td.textContent = cellVal != null ? _escapeHtml(String(cellVal)) : "";
          if (colDef.align) td.setAttribute("data-align", colDef.align);
          tr.appendChild(td);
        }
        // Row click for select event — pass row data so server can identify the item
        (function(rowData) {
          tr.onclick = function() {
            if (node.events && node.events.select) {
              _fireAupEvent(node.id, "select", rowData);
            }
          };
          tr.style.cursor = node.events && node.events.select ? "pointer" : "default";
        })(row);
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    return table;
  }

`;
