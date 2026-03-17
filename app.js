// app.js

// 1. CONFIGURATION
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzn4EvvzN99et-k-N0gqaBuN1-82SDGHwc7l7P6zd9YHqZcFhkg5tkbkO557c6GcSlnBg/exec";

let products = [];
let currentRow = "";

// 2. INITIALIZE
window.onload = () => {
    const saved = localStorage.getItem('milshed_inventory_updates');
    products = saved ? JSON.parse(saved) : (typeof productData !== 'undefined' ? productData : []);
    
    updateStats();
    renderProductList();
    renderDropZone();

    const urlParams = new URLSearchParams(window.location.search);
    const shelfFromUrl = urlParams.get('shelf');
    if (shelfFromUrl) {
        setRow(decodeURIComponent(shelfFromUrl));
    }

    setInterval(() => {
        pullFromCloud(true);
    }, 30000);
};

const productListEl = document.getElementById('productList');
const dropZone = document.getElementById('dropZone');
const rowInput = document.getElementById('rowInput');
const searchInput = document.getElementById('productSearch');

// 3. SEARCH & RENDER
searchInput.addEventListener('input', (e) => renderProductList(e.target.value.toLowerCase()));

function renderProductList(query = "") {
    productListEl.innerHTML = "";
    const filtered = products.filter(p => {
        const str = `${p['Nimi']} ${p['Product ID']} ${p['EAN13']} ${p['Tootekood']}`.toLowerCase();
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
            <div class="text-xs font-bold text-gray-800 leading-tight">${p['Nimi']}</div>
        `;
        productListEl.appendChild(div);
    });
}

// 4. CLOUD SYNC LOGIC
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

async function renameShelf(oldName) {
    const newName = prompt(`Muuda riiuli nime:`, oldName);
    if (!newName || newName.trim() === "" || newName === oldName) return;
    const trimmedNewName = newName.trim().toUpperCase();
    products.forEach(p => {
        if ((p.Location || "").trim() === oldName.trim()) {
            p.Location = trimmedNewName;
            syncToCloud(p);
        }
    });
    saveAndRefresh();
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

// 5. UI MANAGEMENT
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
        
        new QRCode(qrEl, { 
            text: fullUrl, 
            width: 1024, 
            height: 1024,
            correctLevel : QRCode.CorrectLevel.H 
        });
        
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
            wrapper.className = "flex gap-2 items-stretch";
            const btn = document.createElement('button');
            btn.className = "flex-1 bg-white border-2 border-blue-500 text-blue-600 p-4 rounded-2xl text-xs font-black shadow-md active:scale-95 transition-all text-left truncate";
            btn.innerText = rowName;
            btn.addEventListener('click', () => setRow(rowName));
            const editBtn = document.createElement('button');
            editBtn.className = "bg-gray-100 border-2 border-gray-200 text-gray-400 px-4 rounded-2xl text-xs hover:bg-blue-50 hover:text-blue-500 transition-colors";
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
            <span class="font-black text-slate-700 text-xs italic truncate mr-2">${currentRow}</span>
            <span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">${items.length} toodet</span>
        </div>
        <div class="space-y-2" id="shelfItemsList"></div>`;
    const listContainer = document.getElementById('shelfItemsList');
    items.forEach(p => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "flex justify-between items-center bg-white p-3 border rounded-xl shadow-sm text-[11px]";
        itemDiv.innerHTML = `<span class="truncate font-medium text-gray-700">${p.Nimi}</span><button class="text-red-400 font-bold px-2 text-xl">✕</button>`;
        itemDiv.querySelector('button').addEventListener('click', () => removeProduct(p['Product ID']));
        listContainer.appendChild(itemDiv);
    });
}

function resetCurrentShelf() {
    if (!currentRow) return;
    const count = products.filter(p => (p.Location || "").trim() === (currentRow || "").trim()).length;
    if (confirm(`Tühjenda ${currentRow} (${count} toodet)?`)) {
        products.forEach(p => {
            if ((p.Location || "").trim() === (currentRow || "").trim()) {
                p.Location = "";
                syncToCloud(p);
            }
        });
        saveAndRefresh();
    }
}

// 6. UTILS
function printQRCode() {
    if (!currentRow) return;
    const canvas = document.createElement("canvas");
    canvas.width = 400; 
    canvas.height = 420; // Slightly shorter to remove footer space
    const ctx = canvas.getContext("2d");
    
    // Clean White Background
    ctx.fillStyle = "white"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Bold Shelf ID
    ctx.fillStyle = "black"; 
    ctx.font = "bold 70px Arial"; 
    ctx.textAlign = "center";
    ctx.fillText(currentRow, 200, 85);
    
    // Plain QR Code
    const img = document.querySelector("#qrcode img");
    if(!img) return;
    
    // Drawn centered with no text below it
    ctx.drawImage(img, 40, 100, 320, 320);
    
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
    let csv = "Product ID,Tootekood,Nimi,Location\n";
    list.forEach(p => csv += `${p['Product ID']},${p.Tootekood},"${p.Nimi.replace(/,/g, " ")}",${p.Location}\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `milshed_export.csv`;
    a.click();
}