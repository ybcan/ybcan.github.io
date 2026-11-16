"""Simple project creation without changing task or existing project metadata."""
import unified_browser
from playwright.sync_api import expect

class ProjectCreateTests(unified_browser.UnifiedTests):
    def test_new_project_has_three_basic_fields_and_name_only_is_enough(self):
        self.page.locator('[data-new="projects"]').first.click()
        expect(self.page.locator('#kind-field')).not_to_be_visible();expect(self.page.locator('#record-project-more')).not_to_have_attribute('open','')
        visible=self.page.locator('#record-form input:visible,#record-form select:visible,#record-form textarea:visible')
        self.assertEqual(visible.count(),3)
        expect(self.page.locator('#record-goals')).to_be_visible();expect(self.page.locator('#record-acceptance')).to_be_visible();expect(self.page.locator('#record-direction')).not_to_be_visible();expect(self.page.locator('#record-summary')).not_to_be_visible()
        self.page.locator('#record-title').fill('最小项目');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        project=next(p for p in self.stored()['projects']if p['title']=='最小项目');self.assertEqual(project['goalIds'],[]);self.assertEqual(project['acceptance'],'');self.assertEqual(project['kind'],'project')

    def test_project_goal_and_result_save_with_derived_directions_and_advanced_tasks(self):
        self.import_packet(self.packet());self.page.locator('[data-new="projects"]').first.click()
        self.page.locator('#record-title').fill('精简表单项目');self.page.locator('#record-goals').select_option('goal-x');self.page.locator('#record-acceptance').fill('交付一份经过验证的成果')
        self.page.locator('#record-project-more summary').click();self.page.locator('#record-steps').fill('第一步验证\n第二步交付');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        saved=self.stored();project=next(p for p in saved['projects']if p['title']=='精简表单项目');self.assertEqual(project['goalIds'],['goal-x']);self.assertEqual(project['directionIds'],['ai','learn']);self.assertEqual(project['acceptance'],'交付一份经过验证的成果');self.assertEqual(len([t for t in saved['tasks']if t['projectId']==project['id']]),2)
        self.page.get_by_role('button',name='编辑项目：精简表单项目',exact=True).click();expect(self.page.locator('#record-project-more')).to_have_count(0);expect(self.page.locator('#record-acceptance')).to_have_value('交付一份经过验证的成果');self.page.locator('#record-title').fill('精简项目更新');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible();self.assertEqual(next(p for p in self.stored()['projects']if p['id']==project['id'])['directionIds'],['ai','learn'])

    def test_quick_record_can_switch_project_to_task_without_hidden_task_fields(self):
        self.page.locator('#quick-add').click();self.page.locator('#record-kind').select_option('projects');expect(self.page.locator('#record-project-more')).to_be_visible();self.page.locator('#record-kind').select_option('tasks');expect(self.page.locator('#record-project-more')).to_have_count(0);expect(self.page.locator('#record-direction')).to_be_visible();expect(self.page.locator('#record-scheduled')).to_be_visible();self.page.locator('#record-title').fill('切换后的任务');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible();self.assertTrue(any(t['title']=='切换后的任务'for t in self.stored()['tasks']))

    def test_learning_quick_add_keeps_type_picker_while_direct_project_entry_is_simple(self):
        self.page.locator('[data-view="learning"]').click();self.page.locator('#quick-add').click();expect(self.page.locator('#record-kind')).to_be_visible();expect(self.page.locator('#record-kind')).to_have_value('projects');self.page.locator('#record-kind').select_option('tasks');expect(self.page.locator('#record-scheduled')).to_be_visible();self.page.locator('#record-title').fill('学习页快速记录任务');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible();self.assertTrue(any(t['title']=='学习页快速记录任务'for t in self.stored()['tasks']))
