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

    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderProductList(e.target.value);
        });
    }
};

function renderProductList(query = "") {
    const listEl = document.getElementById('productList');
    if (!listEl) return;
    
    listEl.innerHTML = "";
    const cleanQuery = normalizeText(query);

    const filtered = products.filter(p => {
        if (!cleanQuery) return true;
        const id = normalizeText(p['Product ID']);
        const name = normalizeText(p['Nimi']);
        const ean = normalizeText(p['EAN13']);
        const code = normalizeText(p['Tootekood']);
        return id.includes(cleanQuery) || name.includes(cleanQuery) || ean.includes(cleanQuery) || code.includes(cleanQuery);
    });

    filtered.slice(0, 50).forEach(p => {
        const isAssigned = p.Location && p.Location !== "";
        const div = document.createElement('div');
        div.className = `product-card p-3 rounded-xl border shadow-sm cursor-pointer ${isAssigned ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`;
        
        // Updated click handler
        div.onclick = () => handleProductClick(p);

        div.innerHTML = `
            <div class="flex justify-between text-[9px] mb-1 uppercase font-bold text-left">
                <span class="text-gray-400">ID: ${p['Product ID']}</span>
                ${isAssigned ? `<span class="bg-blue-600 text-white px-2 rounded-full">${p.Location}</span>` : ''}
            </div>
            <div class="text-xs font-bold text-gray-800 leading-tight text-left">${p['Nimi']}</div>
            <div class="text-[8px] text-gray-400 mt-1 uppercase text-left">Code: ${p['Tootekood'] || 'N/A'} | EAN: ${p['EAN13'] || 'N/A'}</div>
        `;
        listEl.appendChild(div);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = `<div class="text-center py-10 text-gray-400 text-xs italic">Tulemusi ei leitud</div>`;
    }
}

// NEW: Logic to either Assign or Locate
function handleProductClick(product) {
    // Case 1: A shelf is currently open -> Assign product to this shelf
    if (currentRow) {
        assignProduct(product['Product ID']);
    } 
    // Case 2: No shelf open -> Locate the product
    else {
        if (product.Location && product.Location.trim() !== "") {
            setRow(product.Location.trim());
        } else {
            alert(`Toode "${product['Nimi']}" ei ole veel ühelegi riiulile määratud.`);
        }
    }
}

async function assignProduct(id) {
    if (!currentRow) return; // Guard
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) { 
        products[idx].Location = currentRow.trim(); 
        syncToCloud(products[idx]); 
        saveAndRefresh(); 
    }
}

// --- REST OF THE FUNCTIONS REMAIN THE SAME ---

function enterManifestMode(shelfList) {
    const inputPanel = document.getElementById('inputPanel');
    const stdView = document.getElementById('standardShelfView');
    if(inputPanel) inputPanel.style.display = "none";
    if(stdView) stdView.style.display = "none";
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
        card.innerHTML = `<div class="bg-slate-800 text-white p-3 font-black uppercase italic text-xs flex justify-between"><span>${name}</span><span class="opacity-50">${shelfItems.length} items</span></div><div class="p-1">${shelfItems.length > 0 ? shelfItems.map(p => `<div class="p-3 border-b last:border-0 flex justify-between text-[11px] items-center text-left"><div class="flex flex-col"><span class="font-medium text-gray-700 truncate mr-4">${p.Nimi}</span><span class="text-[8px] text-gray-400 uppercase">${p['Tootekood']}</span></div><span class="text-gray-300 font-mono text-[9px]">ID: ${p['Product ID']}</span></div>`).join('') : '<p class="p-4 text-center text-gray-300 text-xs italic">Empty</p>'}</div>`;
        container.appendChild(card);
    });
    mainArea.appendChild(container);
}

async function removeProduct(id) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) { products[idx].Location = ""; syncToCloud(products[idx]); saveAndRefresh(); }
}

async function syncToCloud(product) {
    try { await fetch(GOOGLE_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ productId: product['Product ID'], tootekood: product['Tootekood'], nimi: product['Nimi'], location: product['Location'] || "" }) }); } catch (e) {}
}

async function pullFromCloud(silent = false) {
    try {
        const res = await fetch(GOOGLE_SCRIPT_URL);
        const data = await res.json();
        let changed = false;
        for (let i = 1; i < data.length; i++) {
            const idx = products.findIndex(p => String(p['Product ID']) === String(data[i][0]));
            if (idx !== -1 && (products[idx].Location || "").trim() !== (data[i][3] || "").trim()) { products[idx].Location = (data[i][3] || "").trim(); changed = true; }
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
    updateUIState(); 
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
    dz.innerHTML = `<div class="flex justify-between items-center mb-4 border-b pb-2"><span class="font-black text-slate-700 text-xs italic">${currentRow}</span><span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">${items.length} items</span></div><div class="space-y-2 text-left">${items.map(p => `<div class="flex justify-between items-center bg-white p-3 border rounded-xl text-[11px] text-left"><span class="truncate font-medium text-gray-700 text-left w-full">${p.Nimi}</span><button onclick="removeProduct('${p['Product ID']}')" class="text-red-400 font-bold px-2 text-xl">✕</button></div>`).join('')}</div>`;
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
    const canvas = document.createElement("canvas"); canvas.width = 400; canvas.height = 450;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 400, 450);
    ctx.fillStyle = "black"; ctx.font = "bold 70px Arial"; ctx.textAlign = "center";
    ctx.fillText(currentRow, 200, 80);
    ctx.drawImage(document.querySelector("#qrcode img"), 50, 110, 300, 300);
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