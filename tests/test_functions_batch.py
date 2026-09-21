"""Source/runtime consistency checks for the four-lesson native Functions batch.

These checks require PyYAML but do not replace the repository's strict native
content validator, official exporter, or complete Python test suite.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[1]
IDS=['MATH_FUNC_002','MATH_FUNC_003','MATH_FUNC_004','MATH_FUNC_005']
CURRICULUM=json.loads((ROOT/'docs/curriculum-data.json').read_text(encoding='utf-8'))

class UniqueLoader(yaml.SafeLoader):
    def construct_mapping(self,node,deep=False):
        self.flatten_mapping(node)
        result={}
        for k,v in node.value:
            key=self.construct_object(k,deep=deep)
            if key in result:
                raise ValueError(f'Duplicate YAML key: {key}')
            result[key]=self.construct_object(v,deep=deep)
        return result


def sources():
    folder=ROOT/'content/math/algebra_foundations/skills'
    return [yaml.load(next(folder.glob(id+'_*.yaml')).read_text(encoding='utf-8'),Loader=UniqueLoader) for id in IDS]


def test_unique_native_source_metadata_matches_browser_content():
    by_id={s['id']:s for s in CURRICULUM['skills']}
    for source in sources():
        built=by_id[source['id']]
        for key in ['name','domain','subdomain','topic','description','prerequisites','unlocks','tags','mastery','theory','examples','applications','media']:
            assert source[key]==built[key],(source['id'],key)
        assert str(source['schema_version'])=='0.2'
        assert source['test']['question_count']==built['question_count']==20
        assert source['test']['randomize_order']==built['native_randomize_order'] is True
        for original,exported in zip(source['test']['questions'],built['native_templates'],strict=True):
            for key,value in original.items():
                assert exported[key]==value,(original['id'],key)


def test_native_track_contains_each_addition_once_and_retains_valid_exits():
    track=yaml.load((ROOT/'content/math/algebra_foundations/track.yaml').read_text(encoding='utf-8'),Loader=UniqueLoader)
    assert len(track['skills'])==89
    for id in IDS:
        assert track['skills'].count(id)==1
    assert set(track['exit_skills'])<=set(track['skills'])
    assert 'MATH_FUNC_005' in track['exit_skills']
    assert set(track['skills'])<=set(CURRICULUM['track']['skills'])


def test_assessment_coverage_media_and_review_policies_are_complete():
    all_ids=set();total_fixed_images=0
    for s in sources():
        assert len(s['examples'])==10
        assert len(s['applications'])==4
        assert len(s['test']['questions'])==20
        gates=0
        for q in s['test']['questions']:
            assert q['id'] not in all_ids;all_ids.add(q['id'])
            assert q['explanation_template'].strip() and q['mistake_tags']
            if q.get('media'):
                assert q['type']=='fixed' and q['variables']=={}
                total_fixed_images+=1
            if q['review_policy']['mastery_requires_review_pass']:
                gates+=1
                assert q['answer_mode']=='final_plus_required_work'
                assert q['review_policy']['work_review']=='tutor_required'
                assert q['review_policy']['allow_self_review'] is False
            # Existing browser symbolic sampling needs three finite evaluations.
            # Do not silently widen these shifts without testing that grader.
            if q['id'] in ['FUNC_INV_QUADRATIC_RIGHT_001','FUNC_INV_QUADRATIC_LEFT_001']:
                assert q['variables']['k']['max']<=4
        assert gates==1
    assert len(all_ids)==80 and total_fixed_images==7


def test_new_assets_are_safe_relative_svg_and_match_their_native_sources():
    new_assets=[a for a in CURRICULUM['assets'] if a['path'].startswith('media/native-functions/')]
    assert len(new_assets)==12
    assert sum(a['bytes'] for a in CURRICULUM['assets'])<1_000_000
    for a in new_assets:
        assert '..' not in Path(a['path']).parts
        data=(ROOT/'content/math/algebra_foundations/skills'/a['path']).read_bytes()
        assert len(data)==a['bytes']
        assert hashlib.sha256(data).hexdigest()==a['sha256']
        assert a['mime_type']=='image/svg+xml'
        assert b'<script' not in data.lower()
