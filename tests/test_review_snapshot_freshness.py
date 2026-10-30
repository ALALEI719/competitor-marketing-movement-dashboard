import json,subprocess,tempfile,unittest
from pathlib import Path
SCRIPT=Path(__file__).resolve().parents[1]/'ops/refresh-review-snapshot.py'
class Freshness(unittest.TestCase):
 def snapshot(self,p,stamp,ids):
  p.mkdir();(p/'formal-actions.json').write_text(json.dumps({'updatedAt':stamp,'actions':[{'actionId':i,'reviewStatus':'approved'} for i in ids]}));(p/'marketing-events.json').write_text(json.dumps({'events':[]}));(p/'monitor-summary.json').write_text(json.dumps({'totals':{'count':len(ids)}}))
 def run_case(self,old,new,oldids,newids,invalid=False):
  with tempfile.TemporaryDirectory() as t:
   current=Path(t)/'current';incoming=Path(t)/'incoming';self.snapshot(current,old,oldids);self.snapshot(incoming,new,newids)
   if invalid:(incoming/'marketing-events.json').write_text(json.dumps({'events':[{'actionIds':['unknown']}]}))
   result=subprocess.run(['python3',str(SCRIPT),str(incoming),str(current)],capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr);return json.loads((current/'formal-actions.json').read_text())['actions'],json.loads((current/'monitor-summary.json').read_text())['totals']['count']
 def test_stale_primary_cannot_remove_new_reviewed_actions(self):
  rows,count=self.run_case('2026-10-30T10:00:00Z','2026-10-29T10:00:00Z',['a','b'],['a']);self.assertEqual([r['actionId'] for r in rows],['a','b']);self.assertEqual(count,2)
 def test_newer_valid_primary_updates_all_three_files(self):
  rows,count=self.run_case('2026-10-29T10:00:00Z','2026-10-30T10:00:00Z',['a'],['a','b']);self.assertEqual(len(rows),2);self.assertEqual(count,2)
 def test_invalid_references_keep_entire_committed_snapshot(self):
  rows,count=self.run_case('2026-10-29T10:00:00Z','2026-10-30T10:00:00Z',['a'],['a','b'],True);self.assertEqual(len(rows),1);self.assertEqual(count,1)
 def test_same_time_conflicting_primary_is_not_new_evidence(self):
  rows,count=self.run_case('2026-10-30T10:00:00Z','2026-10-30T10:00:00Z',['a','b'],['a']);self.assertEqual(len(rows),2);self.assertEqual(count,2)
if __name__=='__main__':unittest.main()
