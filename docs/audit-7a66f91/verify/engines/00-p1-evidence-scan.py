# يجمع تقارير المحوّل من أدلة P1 الحية (قراءة فقط) لكل فيديو ملتقط.
import json, os, sys
root = sys.argv[1]
seen = {}
def walk(o, path):
    if isinstance(o, dict):
        if 'report' in o and isinstance(o['report'], dict) and 'converter' in o['report']:
            r = o['report']
            key = (o.get('videoId'), r.get('trackKind'), r.get('mode'))
            rec = seen.setdefault(key, {'files': set(), 'ok': set(), 'codes': set(), 'converter': [], 'stats': None, 'cueCount': set()})
            rec['files'].add(os.path.basename(path))
            rec['ok'].add(o.get('ok'))
            rec['codes'].add(o.get('code'))
            c = json.dumps(r.get('converter'), sort_keys=True)
            if c not in rec['converter']: rec['converter'].append(c)
            rec['stats'] = r.get('stats')
            rec['cueCount'].add(r.get('cueCount'))
        for v in o.values(): walk(v, path)
    elif isinstance(o, list):
        for v in o: walk(v, path)
for dp, dn, fn in os.walk(root):
    for f in fn:
        if f.endswith('.json'):
            p = os.path.join(dp, f)
            try: d = json.load(open(p, encoding='utf-8'))
            except Exception: continue
            walk(d, p)
for k, v in sorted(seen.items(), key=lambda x: str(x[0])):
    print(k, 'ok=', v['ok'], 'codes=', v['codes'], 'cues=', v['cueCount'], 'files=', len(v['files']))
    for c in v['converter']:
        cc = json.loads(c)
        if isinstance(cc, dict) and 'options' in cc: cc.pop('options')
        print('   converter:', cc)
    print('   stats:', v['stats'])
