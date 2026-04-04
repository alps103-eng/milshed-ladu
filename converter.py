import csv
import json
import os

# Find the csv file automatically in the current folder
csv_files = [f for f in os.listdir('.') if f.endswith('.csv')]

if not csv_files:
    print("❌ Error: No CSV file found in this folder!")
else:
    # Use the first CSV file found
    input_file = csv_files[0]
    products = []
    
    print(f"Reading {input_file}...")
    
    with open(input_file, mode='r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            products.append({
                "Product ID": row.get('Product ID', ''),
                "Tootekood": row.get('Tootekood', ''),
                "Nimi": row.get('Nimi', ''),
                "EAN13": row.get('EAN13', '').replace('0.0', ''),
                "Location": row.get('Location', '')
            })
            
    with open('data.js', 'w', encoding='utf-8') as f:
        f.write('const productData = ' + json.dumps(products, ensure_ascii=False, indent=2) + ';')
    
    print(f"✅ Created data.js from {input_file}!")