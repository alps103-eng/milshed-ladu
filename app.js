// app.js

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzn4EvvzN99et-k-N0gqaBuN1-82SDGHwc7l7P6zd9YHqZcFhkg5tkbkO557c6GcSlnBg/exec";

let products = [];
let currentRow = "";
let selectedShelves = new Set();

window.onload = () => {
    const saved = localStorage.getItem('milshed_inventory_updates');
    products = saved ? JSON.parse(saved) : (typeof productData !== 'undefined' ? productData : []);
    
    updateStats();
    renderProductList();
    renderDropZone();

    const urlParams = new URLSearchParams(window.location.search);
    const shelfFromUrl = urlParams.get('shelf');
    const multiFromUrl = urlParams.get('multi');

    if (shelfFromUrl) {
        setRow(decodeURIComponent(shelfFromUrl));
    } else if (multiFromUrl) {
        // Multi-link logic: filter main view to only show specific shelves
        const list = multiFromUrl.split(',').map(s => decodeURIComponent(s));
        setRow(""); // Force home view
        setTimeout(() => filterHomeButtons(list), 200);
    }

    setInterval(() => { pullFromCloud(true); }, 30000);
};

const productListEl = document.getElementById('productList');
const dropZone = document.getElementById('dropZone');
const rowInput = document.getElementById('rowInput');
const searchInput = document.getElementById('productSearch');

// SEARCH & RENDER
searchInput.addEventListener('input', (e) => renderProductList(e.target.value.toLowerCase()));

function renderProductList(query = "") {
    productListEl.innerHTML = "";
    const filtered = products.filter(p => {
        const str = `${p['Nimi']} ${p['Product ID']} ${p['EAN13']} ${p['Tootekood']} ${p.Location}`.toLowerCase();
        return str.includes(query);
    }).slice(0, 40);

    filtered.forEach(p => {
        const isAssigned = p.Location && p.Location !== "";
        const div = document.createElement('div');
        div.className = `product-card p-3 rounded-xl border shadow-sm cursor-pointer ${isAssigned ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-100'}`;
        div.onclick = () => assignProduct(p['Product ID']);
        div.innerHTML = `
            <div class="flex justify-between text-[9px] mb-1 uppercase font-bold">
                <span class="text-gray-400">ID: ${p['Product ID']}</span>
                ${isAssigned ? `<span class="bg-blue-600 text-white px-2 rounded-full">${p.Location}</span>` : ''}
            </div>
            <div class="text-xs font-bold text-gray-800 leading-tight text-left">${p['Nimi']}</div>
        `;
        productListEl.appendChild(div);
    });
}

// SYNC & CLOUD
async function assignProduct(id) {
    if (!currentRow) return alert("Vali esmalt riiul!");
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) {
        products[idx].Location = currentRow.trim();
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function removeProduct(id) {
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) {
        products[idx].Location = "";
        syncToCloud(products[idx]);
        saveAndRefresh();
    }
}

async function syncToCloud(product) {
    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                productId: product['Product ID'],
                tootekood: product['Tootekood'],
                nimi: product['Nimi'],
                location: product['Location'] || ""
            })
        });
    } catch (e) { console.error("Sync Error:", e); }
}

async function pullFromCloud(silent = false) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const cloudData = await response.json();
        let hasChanges = false;
        for (let i = 1; i < cloudData.length; i++) {
            const [id, code, name, loc] = cloudData[i];
            const idx = products.findIndex(p => String(p['Product ID']) === String(id));
            const cleanLoc = (loc || "").trim();
            if (idx !== -1 && (products[idx].Location || "").trim() !== cleanLoc) {
                products[idx].Location = cleanLoc;
                hasChanges = true;
            }
        }
        if (hasChanges) saveAndRefresh();
    } catch (e) { if (!silent) console.error("Pull Error:", e); }
}

function saveAndRefresh() {
    localStorage.setItem('milshed_inventory_updates', JSON.stringify(products));
    renderDropZone();
    renderProductList(searchInput.value.toLowerCase());
    updateStats();
}

// UI & SHELF MANAGEMENT
rowInput.addEventListener('input', (e) => {
    currentRow = e.target.value.toUpperCase();
    updateUIState();
});

function setRow(r) {
    rowInput.value = r;
    currentRow = r;
    updateUIState();
}

function updateUIState() {
    const qrEl = document.getElementById("qrcode");
    const nav = document.getElementById('shelf-nav');
    qrEl.innerHTML = "";
    if (currentRow) {
        const baseUrl = window.location.origin + window.location.pathname;
        const fullUrl = `${baseUrl}?shelf=${encodeURIComponent(currentRow)}`;
        new QRCode(qrEl, { text: fullUrl, width: 1024, height: 1024, correctLevel : QRCode.CorrectLevel.H });
        nav.classList.remove('hidden');
        document.getElementById('nav-shelf-id').innerText = currentRow;
    } else {
        nav.classList.add('hidden');
    }
    renderDropZone();
}

function renderDropZone() {
    const activeRows = [...new Set(products.map(p => (p.Location || "").trim()).filter(l => l !== ""))];
    const items = products.filter(p => (p.Location || "").trim() === (currentRow || "").trim());

    if (!currentRow) {
        dropZone.innerHTML = `
            <div class="text-center py-6">
                <p class="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest underline underline-offset-4">Riiulid</p>
                <div class="grid grid-cols-1 gap-3" id="shelfButtonsContainer"></div>
            </div>`;
        const btnContainer = document.getElementById('shelfButtonsContainer');
        activeRows.sort().forEach(rowName => {
            const wrapper = document.createElement('div');
            wrapper.className = "flex gap-2 items-stretch shelf-btn-wrapper";
            const btn = document.createElement('button');
            btn.className = "flex-1 bg-white border-2 border-blue-500 text-blue-600 p-4 rounded-2xl text-xs font-black shadow-md active:scale-95 transition-all text-left truncate";
            btn.innerText = rowName;
            btn.addEventListener('click', () => setRow(rowName));
            const editBtn = document.createElement('button');
            editBtn.className = "bg-gray-100 border-2 border-gray-200 text-gray-400 px-4 rounded-2xl text-xs active:bg-blue-100 active:text-blue-600";
            editBtn.innerHTML = "✎";
            editBtn.addEventListener('click', (e) => { e.stopPropagation(); renameShelf(rowName); });
            wrapper.appendChild(btn);
            wrapper.appendChild(editBtn);
            btnContainer.appendChild(wrapper);
        });
        return;
    }

    dropZone.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b pb-2">
            <span class="font-black text-slate-700 text-xs italic truncate mr-2 text-left">${currentRow}</span>
            <span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">${items.length} toodet</span>
        </div>
        <div class="space-y-2" id="shelfItemsList"></div>`;
    const listContainer = document.getElementById('shelfItemsList');
    items.forEach(p => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "flex justify-between items-center bg-white p-3 border rounded-xl shadow-sm text-[11px]";
        itemDiv.innerHTML = `<span class="truncate font-medium text-gray-700 text-left w-full">${p.Nimi}</span><button class="text-red-400 font-bold px-2 text-xl">✕</button>`;
        itemDiv.querySelector('button').addEventListener('click', () => removeProduct(p['Product ID']));
        listContainer.appendChild(itemDiv);
    });
}

function filterHomeButtons(allowedList) {
    const wrappers = document.querySelectorAll('.shelf-btn-wrapper');
    wrappers.forEach(w => {
        const name = w.querySelector('button').innerText;
        if (!allowedList.includes(name)) w.style.display = "none";
    });
}

// BULK MODAL LOGIC
function openBulkModal() {
    const activeRows = [...new Set(products.map(p => (p.Location || "").trim()).filter(l => l !== ""))].sort();
    const container = document.getElementById('bulkChecklist');
    if (activeRows.length === 0) return alert("Riiuleid ei leitud!");
    
    container.innerHTML = "";
    selectedShelves.clear();
    
    activeRows.forEach(rowName => {
        const item = document.createElement('div');
        item.className = "flex items-center p-4 bg-white border-2 border-gray-100 rounded-2xl cursor-pointer transition-all active:scale-[0.98]";
        item.innerHTML = `
            <div class="w-6 h-6 border-2 border-gray-300 rounded-md mr-4 flex items-center justify-center checkbox-box"></div>
            <span class="font-bold text-slate-700">${rowName}</span>
        `;
        item.onclick = () => toggleBulkItem(item, rowName);
        container.appendChild(item);
    });
    document.getElementById('bulkModal').classList.remove('hidden');
}

function toggleBulkItem(element, rowName) {
    const box = element.querySelector('.checkbox-box');
    if (selectedShelves.has(rowName)) {
        selectedShelves.delete(rowName);
        element.classList.remove('checkbox-selected');
        box.innerHTML = "";
        box.classList.remove('bg-purple-600', 'border-purple-600');
    } else {
        selectedShelves.add(rowName);
        element.classList.add('checkbox-selected');
        box.innerHTML = "✓";
        box.classList.add('bg-purple-600', 'border-purple-600', 'text-white');
    }
}

function selectAllShelves(state) {
    const items = document.querySelectorAll('#bulkChecklist > div');
    items.forEach(item => {
        const name = item.querySelector('span').innerText;
        const currentlySelected = selectedShelves.has(name);
        if (state && !currentlySelected) item.click();
        if (!state && currentlySelected) item.click();
    });
}

function closeBulkModal() { document.getElementById('bulkModal').classList.add('hidden'); }

function processBulkSelection() {
    if (selectedShelves.size === 0) return alert("Vali vähemalt üks riiul!");
    const list = Array.from(selectedShelves);
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = `${baseUrl}?multi=${encodeURIComponent(list.join(','))}`;
    
    const tempDiv = document.createElement('div');
    new QRCode(tempDiv, { text: fullUrl, width: 1024, height: 1024, correctLevel : QRCode.CorrectLevel.H });

    setTimeout(() => {
        const img = tempDiv.querySelector('img');
        const canvas = document.createElement("canvas");
        canvas.width = 400; canvas.height = 420;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "black"; ctx.font = "bold 40px Arial"; ctx.textAlign = "center";
        ctx.fillText("MASTER QR", 200, 70);
        ctx.font = "bold 14px Arial"; ctx.fillStyle = "#666";
        ctx.fillText(`${list.length} Riiulit komplektis`, 200, 95);
        ctx.drawImage(img, 40, 110, 320, 320);
        
        const link = document.createElement('a');
        link.download = `MasterQR_${list.length}_riiulit.png`;
        link.href = canvas.toDataURL("image/png", 1.0);
        link.click();
        closeBulkModal();
    }, 600);
}

// UTILS
async function renameShelf(oldName) {
    const newName = prompt(`Uus nimi riiulile ${oldName}:`, oldName);
    if (!newName || newName.trim() === "" || newName === oldName) return;
    const trimmed = newName.trim().toUpperCase();
    products.forEach(p => { if ((p.Location || "").trim() === oldName.trim()) { p.Location = trimmed; syncToCloud(p); } });
    saveAndRefresh();
}

function resetCurrentShelf() {
    if (!currentRow || !confirm(`Tühjenda riiul ${currentRow}?`)) return;
    products.forEach(p => { if ((p.Location || "").trim() === currentRow.trim()) { p.Location = ""; syncToCloud(p); } });
    saveAndRefresh();
}

function printQRCode() {
    if (!currentRow) return;
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 420;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black"; ctx.font = "bold 70px Arial"; ctx.textAlign = "center";
    ctx.fillText(currentRow, 200, 85);
    const img = document.querySelector("#qrcode img");
    if(!img) return;
    ctx.drawImage(img, 40, 110, 320, 320);
    const link = document.createElement('a');
    link.download = `Riiul_${currentRow}.png`;
    link.href = canvas.toDataURL("image/png", 1.0);
    link.click();
}

function updateStats() {
    const assigned = products.filter(p => p.Location).length;
    document.getElementById('stats-counter').innerText = `T: ${products.length.toLocaleString()} / A: ${assigned}`;
}

function exportData() {
    const list = products.filter(p => p.Location);
    let csv = "ID,Code,Name,Location\n";
    list.forEach(p => csv += `${p['Product ID']},${p.Tootekood},"${p.Nimi.replace(/,/g, " ")}",${p.Location}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ladu_export.csv`;
    a.click();
}