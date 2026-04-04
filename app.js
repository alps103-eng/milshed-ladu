// app.js

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzn4EvvzN99et-k-N0gqaBuN1-82SDGHwc7l7P6zd9YHqZcFhkg5tkbkO557c6GcSlnBg/exec";

let products = [];
let currentRow = "";
let selectedShelves = new Set();

const normalizeText = (str) => {
    return String(str)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
};

window.onload = () => {
    const saved = localStorage.getItem('milshed_inventory_updates');
    products = saved ? JSON.parse(saved) : (typeof productData !== 'undefined' ? productData : []);
    
    // Migrate single EAN13 to array format
    products.forEach(p => {
        if (typeof p.EAN13 === 'string') {
            p.EAN13 = p.EAN13 && p.EAN13 !== '0' ? [p.EAN13] : [];
        } else if (!Array.isArray(p.EAN13)) {
            p.EAN13 = [];
        }
    });
    
    updateStats();
    renderProductList(""); 
    renderDropZone();

    const urlParams = new URLSearchParams(window.location.search);
    const shelfFromUrl = urlParams.get('shelf');
    const multiFromUrl = urlParams.get('multi');

    if (multiFromUrl) {
        enterManifestMode(multiFromUrl.split(',').map(s => decodeURIComponent(s)));
    } else if (shelfFromUrl) {
        setRow(decodeURIComponent(shelfFromUrl));
    }

    setInterval(() => { pullFromCloud(true); }, 30000);

    setupSplitter();

    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderProductList(e.target.value);
        });
    }
};

function toggleSearchPanel() {
    const panel = document.getElementById('inputPanel');
    const header = document.querySelector('.sticky-search');
    if (!panel || !header) return;

    panel.classList.toggle('collapsed');
    header.classList.toggle('collapsed');

    const btn = document.getElementById('toggleSearchBtn');
    const isCollapsed = panel.classList.contains('collapsed');
    if (isCollapsed) {
        btn.innerText = '▼';
        btn.title = 'Expand search/products';
    } else {
        btn.innerText = '▲';
        btn.title = 'Collapse search/products';
    }
}

function renderProductList(query = "") {
    const panel = document.getElementById('inputPanel');
    const header = document.querySelector('.sticky-search');
    if (!panel || !header) return;

    panel.classList.toggle('collapsed');
    header.classList.toggle('collapsed');

    const btn = document.getElementById('toggleSearchBtn');
    const isCollapsed = panel.classList.contains('collapsed');
    if (isCollapsed) {
        btn.innerText = '▼';
        btn.title = 'Expand search/products';
    } else {
        btn.innerText = '▲';
        btn.title = 'Collapse search/products';
    }
}

function setupSplitter() {
    const splitter = document.getElementById('splitter');
    const leftPanel = document.getElementById('inputPanel');
    const rightPanel = document.querySelector('.shelf-panel');
    if (!splitter || !leftPanel || !rightPanel) return;

    let isDragging = false;
    splitter.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.cursor = '';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const container = leftPanel.parentElement;
        if (!container) return;
        const bounds = container.getBoundingClientRect();
        let newWidth = e.clientX - bounds.left;
        newWidth = Math.max(220, Math.min(newWidth, Math.max(bounds.width * 0.7, 380)));
        leftPanel.style.width = `${newWidth}px`;
        leftPanel.style.flex = '0 0 auto';
        rightPanel.style.flex = '1 1 auto';
    });

    // support touch
    splitter.addEventListener('touchstart', (e) => {
        isDragging = true;
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    });
    document.addEventListener('touchend', () => { isDragging = false; document.body.style.cursor = ''; });
    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        const container = leftPanel.parentElement;
        if (!container) return;
        const bounds = container.getBoundingClientRect();
        let newWidth = touch.clientX - bounds.left;
        newWidth = Math.max(220, Math.min(newWidth, Math.max(bounds.width * 0.7, 380)));
        leftPanel.style.width = `${newWidth}px`;
        leftPanel.style.flex = '0 0 auto';
        rightPanel.style.flex = '1 1 auto';
    });
}

function renderProductList(query = "") {
    const listEl = document.getElementById('productList');
    if (!listEl) return;
    
    listEl.innerHTML = "";
    const cleanQuery = normalizeText(query);

    const filtered = products.filter(p => {
        if (!cleanQuery) return true;
        const id = normalizeText(p['Product ID']);
        const name = normalizeText(p['Nimi']);
        const ean = Array.isArray(p['EAN13']) ? p['EAN13'].map(e => normalizeText(e)).join(' ') : normalizeText(p['EAN13'] || '');
        const code = normalizeText(p['Tootekood']);
        return id.includes(cleanQuery) || name.includes(cleanQuery) || ean.includes(cleanQuery) || code.includes(cleanQuery);
    });

    if (currentRow) {
        filtered.sort((a,b) => {
            const aIs = (a.Location || "").trim().toUpperCase() === currentRow.toUpperCase();
            const bIs = (b.Location || "").trim().toUpperCase() === currentRow.toUpperCase();
            if (aIs && !bIs) return -1;
            if (!aIs && bIs) return 1;
            return 0;
        });
    }

    filtered.slice(0, 50).forEach(p => {
        const productLoc = (p.Location || "").trim().toUpperCase();
        const isAssigned = productLoc !== "";
        const isCurrentShelf = currentRow && productLoc === currentRow.toUpperCase();
        const div = document.createElement('div');
        div.className = `product-card p-3 rounded-xl border shadow-sm ${isCurrentShelf ? 'product-highlight border-amber-300' : (isAssigned ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100')}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = "cursor-pointer";
        contentDiv.onclick = () => handleProductClick(p);
        contentDiv.innerHTML = `
            <div class="flex justify-between text-[9px] mb-1 uppercase font-bold text-left">
                <span class="text-gray-400">ID: ${p['Product ID']}</span>
                ${isAssigned ? `<span class="bg-blue-600 text-white px-2 rounded-full">${p.Location}</span>` : ''}
            </div>
            <div class="text-xs font-bold text-gray-800 leading-tight text-left">${p['Nimi']}</div>
        `;
        div.appendChild(contentDiv);
        
        const codeDiv = document.createElement('div');
        codeDiv.className = "flex justify-between items-center mt-2 pt-2 border-t border-gray-200";
        codeDiv.innerHTML = `<span class="text-[8px] text-gray-500">Code: ${p['Tootekood'] || 'None'}</span><button class="text-blue-600 font-bold text-[8px] hover:underline">Edit</button>`;
        codeDiv.querySelector('button').onclick = (e) => { e.stopPropagation(); editProductCode(p['Product ID']); };
        div.appendChild(codeDiv);
        
        // EAN section with multiple EANs support
        const eanContainer = document.createElement('div');
        eanContainer.className = "mt-1";
        
        const eanHeader = document.createElement('div');
        eanHeader.className = "flex justify-between items-center";
        eanHeader.innerHTML = `<span class="text-[8px] text-gray-500">EANs:</span><button class="text-green-600 font-bold text-[8px] hover:underline" onclick="event.stopPropagation(); addProductEAN('${p['Product ID']}')">+ Add</button>`;
        eanContainer.appendChild(eanHeader);
        
        const eans = Array.isArray(p['EAN13']) ? p['EAN13'] : (p['EAN13'] ? [p['EAN13']] : []);
        if (eans.length === 0) {
            const noEanDiv = document.createElement('div');
            noEanDiv.className = "text-[8px] text-gray-400 italic mt-1";
            noEanDiv.textContent = "No EANs";
            eanContainer.appendChild(noEanDiv);
        } else {
            eans.forEach((ean, index) => {
                const eanDiv = document.createElement('div');
                eanDiv.className = "flex justify-between items-center mt-1";
                eanDiv.innerHTML = `<span class="text-[8px] text-gray-600">${ean}</span><div class="flex gap-1"><button class="text-blue-600 font-bold text-[8px] hover:underline" onclick="event.stopPropagation(); editProductEAN('${p['Product ID']}', ${index})">Edit</button><button class="text-red-600 font-bold text-[8px] hover:underline" onclick="event.stopPropagation(); removeProductEAN('${p['Product ID']}', ${index})">×</button></div>`;
                eanContainer.appendChild(eanDiv);
            });
        }
        
        div.appendChild(eanContainer);
        
        listEl.appendChild(div);
    });

    if (filtered.length === 0) {
        const msg = (currentRow && !isGlobalSearch) ? `Riiulil "${currentRow}" pole vastet. (Vajuta 🌐 otsimiseks)` : "Tulemusi ei leitud.";
        listEl.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs italic">${msg}</div>`;
    }
}

function handleProductClick(product) {
    if (currentRow) {
        assignProduct(product['Product ID']);
    } else {
        if (product.Location && product.Location.trim() !== "") {
            setRow(product.Location.trim());
        } else {
            alert(`Toode "${product['Nimi']}" pole määratud.`);
        }
    }
}

async function assignProduct(id) {
    if (!currentRow) return;
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) { 
        products[idx].Location = currentRow.trim(); 
        syncToCloud(products[idx]); 
        saveAndRefresh(); 
    }
}

async function removeProduct(id) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) { products[idx].Location = ""; syncToCloud(products[idx]); saveAndRefresh(); }
}

async function addProductEAN(id) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx === -1) return;
    
    const newEAN = prompt(`Add new EAN for ${products[idx]['Nimi']}:`);
    if (newEAN && newEAN.trim()) {
        if (!Array.isArray(products[idx]['EAN13'])) {
            products[idx]['EAN13'] = products[idx]['EAN13'] ? [products[idx]['EAN13']] : [];
        }
        products[idx]['EAN13'].push(newEAN.trim());
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function editProductEAN(id, index = 0) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx === -1) return;
    
    const eans = Array.isArray(products[idx]['EAN13']) ? products[idx]['EAN13'] : (products[idx]['EAN13'] ? [products[idx]['EAN13']] : []);
    if (index >= eans.length) return;
    
    const currentEAN = eans[index];
    const newEAN = prompt(`Edit EAN for ${products[idx]['Nimi']}:`, currentEAN);
    if (newEAN !== null) {
        eans[index] = newEAN.trim();
        products[idx]['EAN13'] = eans;
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function removeProductEAN(id, index) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx === -1) return;
    
    const eans = Array.isArray(products[idx]['EAN13']) ? products[idx]['EAN13'] : (products[idx]['EAN13'] ? [products[idx]['EAN13']] : []);
    if (index >= eans.length || eans.length <= 1) return;
    
    if (confirm(`Remove EAN "${eans[index]}" from ${products[idx]['Nimi']}?`)) {
        eans.splice(index, 1);
        products[idx]['EAN13'] = eans;
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function editProductCode(id) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx === -1) return;
    const currentCode = products[idx]['Tootekood'] || "";
    const newCode = prompt(`Edit Product Code for ${products[idx]['Nimi']}:`, currentCode);
    if (newCode !== null) {
        products[idx]['Tootekood'] = newCode.trim();
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function syncToCloud(product) {
    const eans = Array.isArray(product['EAN13']) ? product['EAN13'] : (product['EAN13'] ? [product['EAN13']] : []);
    try { await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ productId: product['Product ID'], tootekood: product['Tootekood'], nimi: product['Nimi'], location: product['Location'] || "", ean13: JSON.stringify(eans) }) }); } catch (e) {}
}

async function pullFromCloud(silent = false) {
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL);
        const data = await res.json();
        let changed = false;
        for (let i = 1; i < data.length; i++) {
            const idx = products.findIndex(p => String(p['Product ID']) === String(data[i][0]));
            if (idx !== -1) {
                // Update location
                if ((products[idx].Location || "").trim() !== (data[i][3] || "").trim()) {
                    products[idx].Location = (data[i][3] || "").trim();
                    changed = true;
                }
                // Update EAN13 if server has newer data
                if (data[i][4]) {
                    try {
                        const serverEans = JSON.parse(data[i][4]);
                        const localEans = Array.isArray(products[idx]['EAN13']) ? products[idx]['EAN13'] : (products[idx]['EAN13'] ? [products[idx]['EAN13']] : []);
                        if (JSON.stringify(serverEans.sort()) !== JSON.stringify(localEans.sort())) {
                            products[idx]['EAN13'] = serverEans;
                            changed = true;
                        }
                    } catch (e) {
                        // If JSON parsing fails, treat as single EAN
                        const serverEan = data[i][4];
                        const localEans = Array.isArray(products[idx]['EAN13']) ? products[idx]['EAN13'] : (products[idx]['EAN13'] ? [products[idx]['EAN13']] : []);
                        if (localEans.length !== 1 || localEans[0] !== serverEan) {
                            products[idx]['EAN13'] = [serverEan];
                            changed = true;
                        }
                    }
                }
            }
        }
        if (changed) saveAndRefresh();
    } catch (e) {}
}

function saveAndRefresh() {
    localStorage.setItem('milshed_inventory_updates', JSON.stringify(products));
    renderDropZone(); 
    const sInput = document.getElementById('productSearch');
    renderProductList(sInput ? sInput.value : ""); 
    updateStats();
}

function setRow(r) { 
    const rInput = document.getElementById('rowInput');
    if(rInput) rInput.value = r; 
    currentRow = r;
    const sInput = document.getElementById('productSearch');
    if (sInput) sInput.value = "";
    updateUIState(); 
}

function clearSelectedShelf() {
    currentRow = "";
    updateUIState();
}

function createNewShelf() {
    const rInput = document.getElementById('rowInput');
    const defaultValue = rInput ? rInput.value.trim().toUpperCase() : "";
    const name = prompt('Enter new shelf name:', defaultValue) || "";
    const shelfName = name.trim().toUpperCase();
    if (!shelfName) return;
    setRow(shelfName);
}

function updateUIState() {
    const qrEl = document.getElementById("qrcode");
    const nav = document.getElementById('shelf-nav');
    if(!qrEl) return;
    qrEl.innerHTML = "";
    if (currentRow) {
        const fullUrl = `${window.location.origin + window.location.pathname}?shelf=${encodeURIComponent(currentRow)}`;
        new QRCode(qrEl, { text: fullUrl, width: 256, height: 256 });
        nav.classList.remove('hidden');
        const navId = document.getElementById('nav-shelf-id');
        if(navId) navId.innerText = currentRow;
    } else { if(nav) nav.classList.add('hidden'); }
    renderProductList(""); 
    renderDropZone();
}

function renderDropZone() {
    const dz = document.getElementById('dropZone');
    if(!dz) return;
    const active = [...new Set(products.map(p => (p.Location || "").trim()).filter(l => l !== ""))];
    const items = products.filter(p => (p.Location || "").trim() === (currentRow || "").trim());
    if (!currentRow) {
        dz.innerHTML = `<div class="text-center py-6"><p class="text-[9px] font-bold text-gray-400 mb-6 uppercase tracking-widest underline underline-offset-4">Aktiivsed Riiulid</p><div class="grid grid-cols-1 gap-3" id="shelfBtnContainer"></div></div>`;
        const container = document.getElementById('shelfBtnContainer');
        active.sort().forEach(name => {
            const w = document.createElement('div'); w.className = "flex gap-2 items-stretch";
            const b = document.createElement('button'); b.className = "flex-1 bg-white border-2 border-blue-500 text-blue-600 p-4 rounded-2xl text-xs font-black shadow-md text-left truncate"; b.innerText = name; b.onclick = () => setRow(name);
            const e = document.createElement('button'); e.className = "bg-gray-100 border-2 border-gray-200 text-gray-400 px-4 rounded-2xl text-xs"; e.innerText = "✎"; e.onclick = (ev) => { ev.stopPropagation(); renameShelf(name); };
            w.appendChild(b); w.appendChild(e); container.appendChild(w);
        });
        return;
    }
    
    // Create shelf products with multiple EAN support
    const container = document.createElement('div');
    container.className = "space-y-2 text-left";
    
    items.forEach(p => {
        const productDiv = document.createElement('div');
        productDiv.className = "flex flex-col bg-white p-4 border rounded-2xl shadow-sm text-left";
        
        const headerDiv = document.createElement('div');
        headerDiv.className = "flex justify-between items-center mb-1";
        headerDiv.innerHTML = `<span class="font-bold text-slate-400 text-[10px] uppercase">ID: ${p['Product ID']}</span><button onclick="removeProduct('${p['Product ID']}')" class="text-red-400 font-bold px-2 text-xl">✕</button>`;
        productDiv.appendChild(headerDiv);
        
        const nameDiv = document.createElement('div');
        nameDiv.className = "font-bold text-slate-800 text-sm leading-tight";
        nameDiv.textContent = p.Nimi;
        productDiv.appendChild(nameDiv);
        
        const codeDiv = document.createElement('div');
        codeDiv.className = "flex justify-between items-center mt-2 pt-2 border-t border-gray-100";
        codeDiv.innerHTML = `<span class="text-[8px] text-gray-500">Code: ${p['Tootekood'] || 'No Code'}</span><button onclick="editProductCode('${p['Product ID']}')" class="text-blue-600 font-bold text-[8px] hover:underline">Edit</button>`;
        productDiv.appendChild(codeDiv);
        
        // EAN section for shelf view
        const eanContainer = document.createElement('div');
        eanContainer.className = "mt-1";
        
        const eanHeader = document.createElement('div');
        eanHeader.className = "flex justify-between items-center";
        eanHeader.innerHTML = `<span class="text-[8px] text-gray-500">EANs:</span><button class="text-green-600 font-bold text-[8px] hover:underline" onclick="addProductEAN('${p['Product ID']}')">+ Add</button>`;
        eanContainer.appendChild(eanHeader);
        
        const eans = Array.isArray(p['EAN13']) ? p['EAN13'] : (p['EAN13'] ? [p['EAN13']] : []);
        if (eans.length === 0) {
            const noEanDiv = document.createElement('div');
            noEanDiv.className = "text-[8px] text-gray-400 italic mt-1";
            noEanDiv.textContent = "No EANs";
            eanContainer.appendChild(noEanDiv);
        } else {
            eans.forEach((ean, index) => {
                const eanDiv = document.createElement('div');
                eanDiv.className = "flex justify-between items-center mt-1";
                eanDiv.innerHTML = `<span class="text-[8px] text-gray-600">${ean}</span><div class="flex gap-1"><button class="text-blue-600 font-bold text-[8px] hover:underline" onclick="editProductEAN('${p['Product ID']}', ${index})">Edit</button><button class="text-red-600 font-bold text-[8px] hover:underline" onclick="removeProductEAN('${p['Product ID']}', ${index})">×</button></div>`;
                eanContainer.appendChild(eanDiv);
            });
        }
        
        productDiv.appendChild(eanContainer);
        container.appendChild(productDiv);
    });
    
    dz.innerHTML = `<div class="flex justify-between items-center mb-4 border-b pb-2"><span class="font-black text-slate-700 text-xs italic">${currentRow}</span><span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">${items.length} items</span></div>`;
    dz.appendChild(container);
}

function openBulkModal() {
    const active = [...new Set(products.map(p => (p.Location || "").trim()).filter(l => l !== ""))].sort();
    const c = document.getElementById('bulkChecklist');
    c.innerHTML = ""; selectedShelves.clear();
    active.forEach(name => {
        const item = document.createElement('div'); item.className = "flex items-center p-4 bg-white border-2 border-gray-100 rounded-2xl cursor-pointer transition-all active:scale-[0.98]";
        item.innerHTML = `<div class="w-6 h-6 border-2 border-gray-300 rounded-md mr-4 flex items-center justify-center checkbox-box"></div><span class="font-bold text-slate-700 text-xs">${name}</span>`;
        item.onclick = () => {
            const box = item.querySelector('.checkbox-box');
            if (selectedShelves.has(name)) { selectedShelves.delete(name); item.classList.remove('checkbox-selected'); box.innerHTML = ""; box.classList.remove('bg-purple-600', 'border-purple-600'); }
            else { selectedShelves.add(name); item.classList.add('checkbox-selected'); box.innerHTML = "✓"; box.classList.add('bg-purple-600', 'border-purple-600', 'text-white'); }
        };
        c.appendChild(item);
    });
    document.getElementById('bulkModal').classList.remove('hidden');
}
function selectAllShelves(state) { document.querySelectorAll('#bulkChecklist > div').forEach(i => { const n = i.querySelector('span').innerText; if (state !== selectedShelves.has(n)) i.click(); }); }
function closeBulkModal() { document.getElementById('bulkModal').classList.add('hidden'); }
function processBulkSelection() {
    if (selectedShelves.size === 0) return;
    const list = Array.from(selectedShelves);
    const url = `${window.location.origin + window.location.pathname}?multi=${encodeURIComponent(list.join(','))}`;
    const temp = document.createElement('div');
    new QRCode(temp, { text: url, width: 600, height: 600 });
    setTimeout(() => {
        const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 700;
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 600, 700);
        ctx.fillStyle = "black"; ctx.font = "bold 60px Arial"; ctx.textAlign = "center";
        ctx.fillText("MASTER QR", 300, 80);
        ctx.drawImage(temp.querySelector('img'), 50, 120, 500, 500);
        const link = document.createElement('a'); link.download = `MasterQR.png`; link.href = canvas.toDataURL(); link.click();
        closeBulkModal();
    }, 500);
}
async function renameShelf(old) {
    const n = prompt(`Rename ${old}:`, old); if (!n || n === old) return;
    const trimmed = n.trim().toUpperCase();
    products.forEach(p => { if ((p.Location || "").trim() === old.trim()) { p.Location = trimmed; syncToCloud(p); } });
    saveAndRefresh();
}
function resetCurrentShelf() {
    if (!currentRow || !confirm(`Clear shelf ${currentRow}?`)) return;
    products.forEach(p => { if ((p.Location || "").trim() === currentRow.trim()) { p.Location = ""; syncToCloud(p); } });
    saveAndRefresh();
}
function printQRCode() {
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 420;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 400, 420);
    ctx.fillStyle = "black"; ctx.font = "bold 70px Arial"; ctx.textAlign = "center";
    ctx.fillText(currentRow, 200, 80);
    ctx.drawImage(document.querySelector("#qrcode img"), 40, 100, 320, 320);
    const link = document.createElement('a'); link.download = `${currentRow}.png`; link.href = canvas.toDataURL(); link.click();
}
function updateStats() { 
    const counter = document.getElementById('stats-counter');
    if(counter) counter.innerText = `T: ${products.length.toLocaleString()} / A: ${products.filter(p => p.Location).length}`; 
}
function exportData() {
    const list = products.filter(p => p.Location);
    let csv = "ID,Name,Location\n";
    list.forEach(p => csv += `${p['Product ID']},"${p.Nimi}",${p.Location}\n`);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `export.csv`; a.click();
}

function enterManifestMode(shelfList) {
    document.getElementById('inputPanel').style.display = "none";
    document.getElementById('standardShelfView').style.display = "none";
    document.getElementById('bulkBtnHeader').style.display = "none";
    document.getElementById('clearBtn').style.display = "none";
    const nav = document.getElementById('shelf-nav');
    nav.classList.remove('hidden');
    document.getElementById('nav-shelf-id').innerText = "Manifest View";
    const mainArea = document.getElementById('mainDisplayArea');
    const container = document.createElement('div');
    container.className = "space-y-4 pb-20 mt-4";
    shelfList.forEach(name => {
        const shelfItems = products.filter(p => (p.Location || "").trim() === name.trim());
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden text-left";
        card.innerHTML = `<div class="bg-slate-800 text-white p-3 font-black uppercase italic text-xs flex justify-between"><span>${name}</span><span class="opacity-50">${shelfItems.length} items</span></div><div class="p-1">${shelfItems.length > 0 ? shelfItems.map(p => `<div class="p-4 border-b last:border-0 text-left"><div class="font-bold text-[10px] text-slate-400 uppercase mb-1">ID: ${p['Product ID']}</div><div class="font-bold text-slate-800 text-sm">${p.Nimi}</div></div>`).join('') : '<p class="p-4 text-center text-gray-300 text-xs italic">Empty</p>'}</div>`;
        container.appendChild(card);
    });
    mainArea.appendChild(container);
}