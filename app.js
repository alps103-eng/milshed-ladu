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

    // AUTO-SYNC HEARTBEAT: Checks for cloud updates every 30 seconds
    setInterval(() => {
        pullFromCloud(true); // true = silent mode (no popups)
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
    if (!currentRow) return alert("Select a Shelf ID first!");
    const idx = products.findIndex(p => String(p['Product ID']) === String(id));
    if (idx !== -1) {
        products[idx].Location = currentRow;
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
    } catch (e) { console.error("Cloud Sync Error:", e); }
}

async function pullFromCloud(silent = false) {
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const cloudData = await response.json();
        let hasChanges = false;

        for (let i = 1; i < cloudData.length; i++) {
            const [id, code, name, loc] = cloudData[i];
            const idx = products.findIndex(p => String(p['Product ID']) === String(id));
            if (idx !== -1 && products[idx].Location !== loc) {
                products[idx].Location = loc;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            saveAndRefresh();
            if (!silent) alert("Sync Complete: Data updated from cloud.");
        }
    } catch (e) { if (!silent) console.error("Cloud Pull Error:", e); }
}

function saveAndRefresh() {
    localStorage.setItem('milshed_inventory_updates', JSON.stringify(products));
    renderDropZone();
    renderProductList(searchInput.value.toLowerCase());
    updateStats();
}

// 5. SHELF & UI MANAGEMENT
rowInput.addEventListener('input', (e) => {
    currentRow = e.target.value.trim().toUpperCase();
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
        new QRCode(qrEl, { text: currentRow, width: 64, height: 64 });
        nav.classList.remove('hidden');
        document.getElementById('nav-shelf-id').innerText = currentRow;
    } else {
        nav.classList.add('hidden');
    }
    renderDropZone();
}

function renderDropZone() {
    const activeRows = [...new Set(products.map(p => p.Location).filter(l => l))];
    const items = products.filter(p => p.Location === currentRow);

    if (!currentRow) {
        dropZone.innerHTML = `
            <div class="text-center py-6">
                <p class="text-[10px] font-bold text-gray-400 mb-6 uppercase tracking-widest underline underline-offset-4">Active Shelves</p>
                <div class="grid grid-cols-2 gap-3" id="shelfButtonsContainer"></div>
            </div>`;
        
        const btnContainer = document.getElementById('shelfButtonsContainer');
        activeRows.sort().forEach(rowName => {
            const btn = document.createElement('button');
            btn.className = "bg-white border-2 border-blue-500 text-blue-600 p-4 rounded-2xl text-sm font-black shadow-md active:scale-90 transition-all";
            btn.innerText = rowName;
            // This event listener fix solves the Estonian character issue:
            btn.addEventListener('click', () => setRow(rowName));
            btnContainer.appendChild(btn);
        });

        if (activeRows.length === 0) {
            btnContainer.innerHTML = '<p class="text-sm italic col-span-2 text-gray-300">No shelves assigned yet.</p>';
        }
        return;
    }

    dropZone.innerHTML = `
        <div class="flex justify-between items-center mb-4 border-b pb-2">
            <span class="font-black text-slate-700 text-sm italic">${currentRow}</span>
            <span class="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full">${items.length} items</span>
        </div>
        <div class="space-y-2" id="shelfItemsList"></div>`;
    
    const listContainer = document.getElementById('shelfItemsList');
    items.forEach(p => {
        const itemDiv = document.createElement('div');
        itemDiv.className = "flex justify-between items-center bg-white p-3 border rounded-xl shadow-sm text-[11px]";
        itemDiv.innerHTML = `
            <span class="truncate font-medium text-gray-700">${p.Nimi}</span>
            <button class="text-red-400 font-bold px-2 text-xl">✕</button>
        `;
        itemDiv.querySelector('button').addEventListener('click', () => removeProduct(p['Product ID']));
        listContainer.appendChild(itemDiv);
    });
}

function resetCurrentShelf() {
    if (!currentRow) return;
    const count = products.filter(p => p.Location === currentRow).length;
    if (count === 0) return;
    if (confirm(`Clear all ${count} items from ${currentRow}?`)) {
        products.forEach(p => {
            if (p.Location === currentRow) {
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
    canvas.width = 350; canvas.height = 450;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 350, 450);
    ctx.fillStyle = "black"; ctx.font = "bold 50px Arial"; ctx.textAlign = "center";
    ctx.fillText(currentRow, 175, 70);
    const img = document.querySelector("#qrcode img");
    if(!img) return;
    ctx.drawImage(img, 50, 110, 250, 250);
    const link = document.createElement('a');
    link.download = `Shelf_${currentRow}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

function updateStats() {
    const assigned = products.filter(p => p.Location).length;
    document.getElementById('stats-counter').innerText = `T: ${products.length.toLocaleString()} / A: ${assigned}`;
}

function exportData() {
    const list = products.filter(p => p.Location);
    if(list.length === 0) return alert("No items assigned!");
    let csv = "Product ID,Tootekood,Nimi,Location\n";
    list.forEach(p => {
        const cleanName = String(p.Nimi).replace(/,/g, " ");
        csv += `${p['Product ID']},${p.Tootekood},"${cleanName}",${p.Location}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `milshed_export.csv`;
    a.click();
}