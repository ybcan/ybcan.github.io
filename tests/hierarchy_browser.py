"""User-facing hierarchy behavior with synthetic data only."""
import json
import reliability_browser
from playwright.sync_api import expect

class HierarchyTests(reliability_browser.ReliabilityTests):
    def tree_packet(self):
        p=self.packet();p['batchId']='hierarchy-packet'
        p['records']['goals'].append({'id':'goal-y','title':'第二个长期目标','directionIds':['learn']})
        p['records']['projects'][0]['goalIds']=['goal-x','goal-y'];p['records']['projects'][0]['parentRef']={'collection':'goals','id':'goal-x'}
        p['records']['projects'].append({'id':'child-x','title':'项目下的探索方向','goalIds':['goal-x'],'parentRef':{'collection':'projects','id':'project-x'},'origin':'ai'})
        p['records']['plans'][0]['parentRef']={'collection':'projects','id':'project-x'}
        return p

    def test_tree_has_one_body_secondary_references_and_nested_candidate_plans(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="learning"]').click()
        expect(self.page.locator('#strategy-tree-panel')).to_be_visible()
        expect(self.page.locator('.hierarchy-record[data-key="projects:project-x"]')).to_have_count(1)
        expect(self.page.locator('.hierarchy-reference[data-target="projects:project-x"]')).to_have_count(1)
        row=self.page.locator('.hierarchy-record[data-key="projects:project-x"]')
        row.locator('.hierarchy-title').click()
        expect(self.page.locator('.hierarchy-record[data-key="projects:child-x"]')).to_be_visible()
        plan=self.page.locator('.hierarchy-record[data-key="plans:plan-x"]')
        expect(plan).to_contain_text('建议待确认')
        plan.get_by_role('button',name='采纳',exact=True).click()
        expect(self.page.locator('.hierarchy-record[data-key="plans:plan-x"]')).to_contain_text('已采纳')
        expect(self.page.locator('.hierarchy-record[data-key="plans:plan-x"]')).to_contain_text('进度待确认')

    def test_tree_search_keeps_the_goal_and_project_path_to_a_learning_record(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="learning"]').click()
        self.page.locator('#global-search').fill('下一步如何验证')
        expect(self.page.locator('.hierarchy-record[data-key="goals:goal-x"]')).to_be_visible()
        expect(self.page.locator('.hierarchy-record[data-key="projects:project-x"]')).to_be_visible()
        expect(self.page.locator('.hierarchy-record[data-key="archives:round-x"]')).to_be_visible()
        expect(self.page.locator('.hierarchy-record[data-key="plans:plan-x"]')).to_have_count(0)
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)

    def test_editing_ownership_moves_the_same_record_without_changing_execution(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="learning"]').click()
        self.page.locator('.hierarchy-record[data-key="projects:project-x"]').get_by_role('button',name='编辑',exact=True).click()
        self.page.locator('#record-parent').select_option('goals:goal-y')
        self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        expect(self.page.locator('.hierarchy-record[data-key="projects:project-x"]')).to_have_count(1)
        stored=self.page.evaluate('async()=>JSON.parse(await(await(await import("#workbench/storage")).openWorkspaceStore()).read()).data')
        item=next(x for x in stored['projects']if x['id']=='project-x')
        self.assertEqual(item['parentRef'],{'collection':'goals','id':'goal-y'})
        self.assertEqual(item['execution'],'active')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for();self.page.locator('[data-view="learning"]').click()
        expect(self.page.locator('.hierarchy-reference[data-target="projects:project-x"]')).to_have_count(1)

    def test_manual_automatic_ownership_is_retained_after_reload(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="learning"]').click()
        for value in ['goals:goal-y','']:
            self.page.locator('.hierarchy-record[data-key="projects:project-x"]').get_by_role('button',name='编辑',exact=True).click()
            self.page.locator('#record-parent').select_option(value)
            self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        item=self.page.evaluate('async()=>JSON.parse(await(await(await import("#workbench/storage")).openWorkspaceStore()).read()).data.projects.find(p=>p.id==="project-x")')
        self.assertIsNone(item['parentRef']);self.assertTrue(item.get('parentCustomized'))

    def test_search_opens_a_deep_valid_hierarchy_without_stack_overflow(self):
        self.page.evaluate('''async()=>{
          const {createWorkspace,serializeBackup}=await import('#workbench/workspace');
          const state=createWorkspace(false);state.goals=[{id:'deep-goal',title:'Deep goal'}];
          for(let i=0;i<1200;i++)state.plans.push({id:'deep-'+i,title:i===1199?'Unique deep match':'Stage '+i,parentRef:{collection:i?'plans':'goals',id:i?'deep-'+(i-1):'deep-goal'}});
          const store=await(await import('#workbench/storage')).openWorkspaceStore();await store.update(()=>serializeBackup(state));
        }''')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        self.page.locator('#global-search').fill('Unique deep match')
        self.page.locator('[data-view="learning"]').click()
        expect(self.page.locator('.hierarchy-record[data-key="plans:deep-1199"]')).to_have_count(1)
        self.assertEqual(self.errors,[])
