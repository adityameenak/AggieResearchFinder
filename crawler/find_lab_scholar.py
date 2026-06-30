import json, re, requests
from concurrent.futures import ThreadPoolExecutor
H={'User-Agent':'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36 ResearchFinderBot/1.0'}
d=json.load(open('../ui/public/faculty.json'))
labs=[r for r in d if len((r.get('research_summary') or '').strip())<40 and not (r.get('google_scholar') or '').strip() and (r.get('lab_website') or '').strip()]
def check(r):
    try: t=requests.get(r['lab_website'],headers=H,timeout=12).text
    except Exception: return None
    m=re.search(r'https?://scholar\.google\.[a-z.]+/citations\?[^"\'<> ]*user=([\w-]+)', t)
    if m:
        uid=m.group(1)
        return (r['id'], 'https://scholar.google.com/citations?user='+uid+'&hl=en')
    return None
out={}
with ThreadPoolExecutor(max_workers=10) as ex:
    for res in ex.map(check, labs):
        if res: out[res[0]]=res[1]
json.dump(out, open('/tmp/lab_scholar_map.json','w'), indent=2)
print('found', len(out), 'scholar links from', len(labs), 'lab sites')
