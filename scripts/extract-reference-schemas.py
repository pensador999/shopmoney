"""Read only headers/format from git blobs; never export product records."""
import csv, io, json, subprocess, pathlib, zipfile, re, unicodedata, xml.etree.ElementTree as ET
root = pathlib.Path(__file__).resolve().parents[2]
repo = root / 'references' / 'HOOK-PRIME'
def git(*args):
    return subprocess.check_output(['git', '-C', str(repo), *args])
commit = git('rev-parse', 'origin/main').decode().strip()
paths = git('ls-tree', '-rz', '--name-only', commit, '--', 'PLANILHAS EXEMPLOS').decode().split('\0')
result = []
for path in filter(None, paths):
    data = git('show', f'{commit}:{path}')
    item = {'source': path, 'commit': commit}
    if path.lower().endswith('.csv'):
        encoding = 'utf-8-sig'
        try: text = data.decode(encoding)
        except UnicodeDecodeError: encoding = 'cp1252'; text = data.decode(encoding)
        first = text.splitlines()[0]
        delimiter = ';' if first.count(';') > first.count(',') else ','
        headers = next(csv.reader(io.StringIO(text), delimiter=delimiter))
        item.update(format='csv', encoding=encoding, delimiter=delimiter, bom=data.startswith(b'\xef\xbb\xbf'), newline='CRLF' if b'\r\n' in data else 'LF', headers=headers, columns=len(headers))
    elif path.lower().endswith('.xlsx'):
        ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            shared = ET.fromstring(z.read('xl/sharedStrings.xml')) if 'xl/sharedStrings.xml' in z.namelist() else []
            entries = list(shared)
            labels = {'PESO','PESO BRUTO','PESO LIQUIDO','PESO (KG)','PESO KG','ALTURA','ALTURA (CM)','LARGURA','COMPRIMENTO','TAMANHO','PRODUTO','CODIGO','SKU','REFERENCIA','MEDIDAS','ESPESSURA'}
            sheets = []
            for name in sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml')):
                sheet = ET.fromstring(z.read(name))
                merges = sheet.find('m:mergeCells', ns)
                structural_labels = []
                for cell in sheet.findall('m:sheetData/m:row/m:c', ns):
                    value = cell.find('m:v',ns)
                    text = ''.join(entries[int(value.text)].itertext()) if cell.get('t') == 's' and value is not None else ''
                    normalized = ''.join(c for c in unicodedata.normalize('NFD',text.strip().upper()) if not unicodedata.combining(c))
                    if normalized in labels: structural_labels.append({'cell':cell.get('r'),'label':text,'styleIndex':cell.get('s')})
                sheets.append({'sheetPart': name, 'mergedRegions': len(merges) if merges is not None else 0,
                    'structuralLabelsOnly':structural_labels,
                    'headerStatus': 'Not assumed: layout requires mapping; only allowlisted generic labels retained, no measures or product records.'})
            item.update(format='xlsx', sheets=sheets)
    result.append(item)
out = root / 'catalog-ops' / 'schemas' / 'reference-headers-2026-10-16.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
code = git('show', f'{commit}:hub/public/js/spreadsheet-gen.js').decode('utf-8')
sankhya_block = re.search(r'const SANKHYA_HEADERS_45 = \[(.*?)\];', code, re.S).group(1)
sankhya_headers = re.findall(r"'([^']+)'", sankhya_block)
bling_headers = next(x['headers'] for x in result if x.get('format') == 'csv')
assert len(bling_headers) == 59 and len(sankhya_headers) == 45
for name, headers, destination, delimiter in [('bling-59',bling_headers,'Bling',';'),('sankhya-45',sankhya_headers,'Sankhya',';')]:
    schema = {'id':name,'version':'2026-10-16','destination':destination,'sourceCommit':commit,'headers':headers,
        'format':{'encoding':'UTF-8','delimiter':delimiter,'delimiterEvidence':'observed CSV headers' if name=='bling-59' else 'proposed; confirm target import configuration'},
        'scope':'Column names and order only. No product records, defaults or tax classification.', 'directShopifyImport':False}
    (out.parent / f'{name}.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'files': len(result), 'csvLayouts': len({tuple(x['headers']) for x in result if 'headers' in x}), 'output': str(out)}, ensure_ascii=True))
