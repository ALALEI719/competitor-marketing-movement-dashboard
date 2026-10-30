#!/usr/bin/env python3
"""Keep a newer committed review snapshot when the primary deploy is stale."""
from pathlib import Path
from datetime import datetime
import json,os,sys
FILES=('formal-actions.json','marketing-events.json','monitor-summary.json')
def load(directory):
 data={name:json.loads((directory/name).read_text()) for name in FILES}
 actions=data[FILES[0]]['actions'];events=data[FILES[1]]['events'];summary=data[FILES[2]]
 if not isinstance(actions,list) or not isinstance(events,list) or not isinstance(summary.get('totals'),dict):raise ValueError('invalid snapshot schema')
 ids=[a['actionId'] for a in actions]
 if len(ids)!=len(set(ids)) or any(a.get('reviewStatus')!='approved' for a in actions):raise ValueError('invalid approved action set')
 if any(not set(e.get('actionIds',[])).issubset(ids) for e in events):raise ValueError('event references unknown actions')
 stamp=datetime.fromisoformat(data[FILES[0]]['updatedAt'].replace('Z','+00:00'))
 if stamp.tzinfo is None:raise ValueError('snapshot timestamp lacks timezone')
 return data,stamp
incoming,current=map(Path,sys.argv[1:]);existing,old=load(current)
try:new,stamp=load(incoming)
except (ValueError,KeyError,TypeError,OSError) as error:
 print('Keeping validated committed review snapshot: invalid primary snapshot');sys.exit(0)
if stamp<old or (stamp==old and new[FILES[0]]!=existing[FILES[0]]):
 print('Keeping newer committed review snapshot; primary is stale or ambiguous');sys.exit(0)
# All three inputs are validated before replacing any file. If this job fails,
# its existing commit/deploy steps do not run, so no partial snapshot is published.
for name in FILES:os.replace(incoming/name,current/name)
print('Accepted current primary review snapshot')
