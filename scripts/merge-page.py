import sys,re,json
# Merge newly built clips into the live listening page when another session published first: keeps every
# published clip, group and template change, and inserts only the given ids from your own build.
# usage: merge_page.py <published.html> <mine.html> <out.html> <id> [<id>...]
src=open(sys.argv[1],encoding='utf-8').read()
pat=re.compile(r'(<script type="application/json" id="lab-data">)(.*?)(</script>)',re.S)
m=pat.search(src)
theirs=json.loads(m.group(2).replace('\\u003c','<'))
mine=json.loads(pat.search(open(sys.argv[2],encoding='utf-8').read()).group(2).replace('\\u003c','<'))
want=sys.argv[4:]
add=[c for c in mine['clips'] if c['id'] in want]
assert len(add)==len(want), (len(add), want)
ids={c['id'] for c in theirs['clips']}
add=[x for x in add if x['id'] not in ids]
group=add[0]['group'] if add else None
clips=[]; done=not add
for c in theirs['clips']:
    if not done and c.get('group')==group:
        clips.extend(add); done=True
    clips.append(c)
if not done: clips=add+clips
theirs['clips']=clips
if group and group not in theirs['groups']: theirs['groups'].insert(0,group)
data=json.dumps(theirs,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
open(sys.argv[3],'w',encoding='utf-8').write(src[:m.start(2)]+data+src[m.end(2):])
print("merged", len(add), "into", len(theirs['clips']), "clips;", len(theirs['groups']), "groups")
