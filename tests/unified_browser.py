"""Canonical action model acceptance; synthetic data only."""
import editing_browser
from playwright.sync_api import expect

class UnifiedTests(editing_browser.EditingTests):
    def test_one_task_is_shared_by_project_schedule_and_todo(self):
        self.add_record('projects','统一执行项目', 'ai', steps='可验证动作')
        p=self.page.locator('.project').filter(has_text='统一执行项目')
        expect(p).to_contain_text('0 / 1')
        p.get_by_role('checkbox',name='完成任务：可验证动作',exact=True).check()
        self.page.locator('[data-view="tasks"]').click();self.page.locator('#task-filter').select_option('done')
        expect(self.page.locator('#tasks-list')).to_contain_text('可验证动作')
        self.page.locator('#tasks-list').get_by_role('button',name='编辑任务：可验证动作',exact=True).click()
        self.page.locator('#record-scheduled').fill('2026-11-16');self.page.locator('#record-priority').select_option('high');self.page.locator('#record-status').select_option('pending');self.page.locator('#record-submit').click()
        self.page.locator('[data-view="overview"]').click();expect(self.page.locator('.project').filter(has_text='统一执行项目')).to_contain_text('0 / 1');expect(self.page.locator('#plan-columns')).to_contain_text('可验证动作')
        saved=self.stored();self.assertEqual(len([t for t in saved['tasks']if t['title']=='可验证动作']),1);self.assertEqual(next(p for p in saved['projects']if p['title']=='统一执行项目')['steps'],[])
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for();expect(self.page.locator('#plan-columns')).to_contain_text('可验证动作')

    def test_ai_route_stays_material_until_explicit_conversion_and_adoption(self):
        self.import_packet(self.packet());self.page.locator('[data-view="archives"]').click();self.page.locator('#archive-filter').select_option('materials')
        material=self.page.locator('.material-card').filter(has_text='AI候选规划');expect(material).to_be_visible();material.get_by_role('button',name='转为任务',exact=True).click()
        expect(self.page.locator('#record-dialog')).to_be_visible();expect(self.page.locator('#record-adoption')).to_have_value('candidate');self.page.locator('#record-submit').click()
        self.page.locator('[data-view="tasks"]').click();self.page.locator('#task-filter').select_option('pending');expect(self.page.locator('#tasks-list')).not_to_contain_text('AI候选规划');self.page.locator('#task-filter').select_option('candidate');expect(self.page.locator('#tasks-list')).to_contain_text('AI候选规划')
        self.page.locator('#tasks-list').get_by_role('button',name='编辑任务：AI候选规划',exact=True).click();self.page.locator('#record-adoption').select_option('adopted');self.page.locator('#record-submit').click();self.page.locator('#task-filter').select_option('pending');expect(self.page.locator('#tasks-list')).to_contain_text('AI候选规划')
        self.assertFalse(next(t for t in self.stored()['tasks']if t['title']=='AI候选规划')['done'])

    def test_title_only_task_edit_keeps_all_directions_and_secondary_projects(self):
        packet=self.tree_packet();packet['records']['tasks']=[{'id':'multi-task','title':'Multi context action','projectId':'project-x','itemIds':['project-x','child-x'],'directionIds':['ai','learn'],'goalIds':['goal-x','goal-y'],'adoption':'adopted'}]
        self.import_packet(packet);self.page.locator('[data-view="tasks"]').click();self.page.locator('#tasks-list').get_by_role('button',name='编辑任务：Multi context action',exact=True).click();self.page.locator('#record-title').fill('Retitled action');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        record=next(t for t in self.stored()['tasks']if t['id']=='multi-task');self.assertEqual(record['directionIds'],['ai','learn']);self.assertEqual(record['itemIds'],['project-x','child-x']);self.assertEqual(record['goalIds'],['goal-x','goal-y'])

    def test_stale_material_conversion_does_not_convert_changed_source(self):
        self.import_packet(self.packet());self.page.locator('[data-view="archives"]').click();self.page.locator('#archive-filter').select_option('materials')
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for();other.locator('[data-view="archives"]').click();other.locator('#archive-filter').select_option('materials');other.locator('.material-card').filter(has_text='AI候选规划').get_by_role('button',name='编辑',exact=True).click();other.locator('#record-title').fill('Other tab changed roadmap');other.locator('#record-adoption').select_option('adopted');other.locator('#record-submit').click();expect(other.locator('#record-dialog')).not_to_be_visible()
        self.page.locator('.material-card').filter(has_text='AI候选规划').get_by_role('button',name='转为任务',exact=True).click();expect(self.page.locator('#toast')).to_contain_text('变化');expect(self.page.locator('#archive-list')).to_contain_text('Other tab changed roadmap');self.assertFalse(any(t.get('migrationKey')=='["plan","plan-x"]'for t in self.stored()['tasks']));other.close()

    def test_conflicting_task_action_refreshes_display_and_export(self):
        self.page.locator('[data-view="tasks"]').click();other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for();other.locator('[data-view="tasks"]').click();other.locator('#tasks-list').get_by_role('button',name='编辑任务：读完一篇前沿文章',exact=True).click();other.locator('#record-title').fill('Newest persisted action');other.locator('#record-submit').click();expect(other.locator('#record-dialog')).not_to_be_visible()
        self.page.locator('#tasks-list').get_by_role('checkbox',name='完成任务：读完一篇前沿文章',exact=True).check();expect(self.page.locator('#toast')).to_contain_text('变化');expect(self.page.locator('#tasks-list')).to_contain_text('Newest persisted action');expect(self.page.locator('#tasks-list')).not_to_contain_text('读完一篇前沿文章')
        self.page.locator('#settings-button').click()
        with self.page.expect_download() as d:self.page.locator('#export-button').click()
        import json
        from pathlib import Path
        data=json.loads(Path(d.value.path()).read_text())['data'];self.assertTrue(any(t['title']=='Newest persisted action'for t in data['tasks']));other.close()

    def test_candidate_completion_flags_do_not_become_execution_history(self):
        packet=self.packet();packet['records']['tasks']=[{'id':'suggested-done','title':'Candidate completed claim','done':True,'adoption':'candidate','origin':'ai'}]
        self.import_packet(packet);self.page.locator('[data-view="archives"]').click();self.page.locator('#archive-filter').select_option('history');expect(self.page.locator('#archive-list')).not_to_contain_text('Candidate completed claim')
