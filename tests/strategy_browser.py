"""Strategy cockpit acceptance checks with synthetic, non-personal data."""
import json
import browser_smoke
from playwright.sync_api import expect

class StrategyTests(browser_smoke.CockpitTests):
    # Inherit the existing smoke suite to verify the same flows after strategy imports.
    def packet(self, batch='test-1'):
        return {'format':'strategy-workbench-update','version':1,'batchId':batch,'records':{
            'goals':[{'id':'goal-x','title':'合成长期目标','directionIds':['ai','learn'],'origin':'user'}],
            'projects':[{'id':'project-x','title':'合成实践项目','goalIds':['goal-x'],'directionIds':['ai','learn'],'origin':'user','execution':'active','nextStep':'完成一次验证'}],
            'plans':[{'id':'plan-x','title':'AI候选规划','goalIds':['goal-x'],'itemIds':['project-x'],'origin':'ai'}],
            'sources':[{'id':'source-x','title':'合成来源','shareUrl':'https://chatgpt.com/share/synthetic'}],
            'archives':[{'id':'round-x','title':'合成学习断点','projectId':'project-x','sourceId':'source-x','goalIds':['goal-x'],'directionIds':['ai','learn'],'question':'下一步如何验证？'}]}}

    def import_packet(self,packet):
        self.page.locator('#update-file').set_input_files({'name':'update.json','mimeType':'application/json','buffer':json.dumps(packet).encode()})
        expect(self.page.locator('#update-dialog')).to_be_visible()
        self.page.locator('#update-apply').click()
        expect(self.page.locator('#update-dialog')).not_to_be_visible()

    def test_strategy_goals_associations_and_adoption(self):
        self.import_packet(self.packet())
        goal=self.page.locator('.goal-card').filter(has_text='合成长期目标')
        expect(goal).to_contain_text('1 个事项')
        goal.get_by_role('button',name='查看关联事项').click()
        expect(self.page.locator('#projects-list')).to_contain_text('合成实践项目')
        expect(self.page.locator('#projects-list .project')).to_have_count(1)
        expect(self.page.locator('#plan-columns')).not_to_contain_text('AI候选规划')
        proposal=self.page.locator('.proposal-card').filter(has_text='AI候选规划')
        proposal.get_by_role('button',name='采纳',exact=True).click()
        stored=self.page.evaluate('async () => { const s = await (await import("./workbench/storage.mjs")).openWorkspaceStore(); return JSON.parse(await s.read()).data; }')
        plan=next(x for x in stored['plans'] if x['id']=='plan-x')
        self.assertEqual(plan['adoption'],'adopted'); self.assertEqual(plan['execution'],'unknown')
        self.assertIn('AI候选规划',self.page.locator('#plan-columns').inner_text())
        self.page.reload()
        expect(self.page.locator('.goal-card').filter(has_text='合成长期目标')).to_be_visible()

    def test_archive_continuation_history_and_safe_sources(self):
        self.import_packet(self.packet())
        self.page.locator('[data-view="archives"]').click()
        row=self.page.locator('.archive-card').filter(has_text='合成学习断点')
        expect(row).to_contain_text('待回答')
        row.get_by_role('button',name='查看记录').click()
        expect(self.page.locator('#strategy-dialog')).to_contain_text('原始时间未知')
        expect(self.page.get_by_role('link',name='查看分享记录')).to_have_attribute('href','https://chatgpt.com/share/synthetic')
        self.assertEqual(self.page.get_by_role('link',name='回到原对话').count(),0)
        self.page.get_by_role('button',name='编辑归档',exact=True).click()
        self.page.locator('#strategy-answer').fill('先定义可观察的证据')
        self.page.locator('#strategy-feedback').fill('还需要反例验证')
        self.page.locator('#strategy-save').click()
        expect(self.page.locator('#archive-list')).to_contain_text('已归档')
        row.get_by_role('button',name='查看记录',exact=True).click()
        expect(self.page.locator('#strategy-dialog')).to_contain_text('手工修改')

    def test_preview_duplicates_conflicts_and_goal_creation(self):
        self.import_packet(self.packet())
        self.import_packet(self.packet())
        self.assertEqual(self.page.locator('.goal-card').filter(has_text='合成长期目标').count(),1)
        self.page.locator('#new-goal').click()
        self.page.locator('#strategy-title').fill('自己的新目标')
        self.page.locator('#strategy-why').fill('用于验证长期积累')
        self.page.locator('#strategy-save').click()
        expect(self.page.locator('.goal-card').filter(has_text='自己的新目标')).to_be_visible()
        p=self.packet('test-2');p['records']['projects'][0]['nextStep']='来源修改的下一步'
        self.page.locator('#update-file').set_input_files({'name':'update.json','mimeType':'application/json','buffer':json.dumps(p).encode()})
        expect(self.page.locator('#update-dialog')).to_contain_text('保留本地')
        self.page.locator('#update-apply').click()
        expect(self.page.locator('#projects-list')).to_contain_text('完成一次验证')

    def test_mobile_strategy_has_no_horizontal_overflow(self):
        self.import_packet(self.packet())
        self.page.set_viewport_size({'width':390,'height':844})
        self.assertLessEqual(self.page.evaluate('document.documentElement.scrollWidth'),390)
        self.page.locator('#new-goal').click()
        self.assertLessEqual(self.page.locator('#strategy-dialog').bounding_box()['width'],390)

    def test_import_write_failure_preserves_workspace_and_preview(self):
        before=self.page.evaluate('async () => { const s = await (await import("./workbench/storage.mjs")).openWorkspaceStore(); return s.read(); }')
        self.page.evaluate("() => { IDBObjectStore.prototype.put=()=>{throw Error('quota')} }")
        self.page.locator('#update-file').set_input_files({'name':'update.json','mimeType':'application/json','buffer':json.dumps(self.packet()).encode()})
        self.page.locator('#update-apply').click()
        expect(self.page.locator('#update-dialog')).to_be_visible()
        self.assertEqual(self.page.evaluate('async () => { const s = await (await import("./workbench/storage.mjs")).openWorkspaceStore(); return s.read(); }'),before)
        self.assertEqual(self.page.locator('.goal-card').filter(has_text='合成长期目标').count(),0)

    def test_shared_source_edits_from_another_tab_are_not_reverted(self):
        p=self.packet();p['records']['archives'].append({'id':'round-y','title':'另一轮合成练习','projectId':'project-x','sourceId':'source-x','question':'另一个问题'})
        self.import_packet(p)
        self.page.locator('[data-view="archives"]').click()
        self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='查看记录').click()
        self.page.get_by_role('button',name='编辑归档',exact=True).click()
        other=self.context.new_page();other.goto(self.url);other.locator('[data-view="archives"]').click()
        other.locator('.archive-card').filter(has_text='另一轮合成练习').get_by_role('button',name='查看记录').click()
        other.get_by_role('button',name='编辑归档',exact=True).click()
        other.locator('#strategy-share').fill('https://example.com/updated-source')
        other.locator('#strategy-save').click()
        self.page.locator('#strategy-answer').fill('仅修改本轮回答')
        self.page.locator('#strategy-save').click()
        data=self.page.evaluate('async () => { const s = await (await import("./workbench/storage.mjs")).openWorkspaceStore(); return JSON.parse(await s.read()).data; }')
        self.assertEqual(next(s for s in data['sources'] if s['id']=='source-x')['shareUrl'],'https://example.com/updated-source')
        self.assertTrue(any(r['collection']=='sources' for r in data['revisions']))
        self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='查看记录').click()
        self.page.get_by_role('button',name='编辑归档',exact=True).click()
        self.page.locator('#strategy-share').fill('https://example.com/my-edit')
        other.locator('.archive-card').filter(has_text='另一轮合成练习').get_by_role('button',name='查看记录').click()
        other.get_by_role('button',name='编辑归档',exact=True).click()
        other.locator('#strategy-share').fill('https://example.com/other-edit')
        other.locator('#strategy-save').click()
        self.page.locator('#strategy-save').click()
        expect(self.page.locator('#strategy-dialog')).to_be_visible()
        expect(self.page.locator('#strategy-dialog')).to_contain_text('来源链接已在其他标签页修改')
        expect(self.page.locator('#strategy-share')).to_have_value('https://example.com/my-edit')
        other.close()

    def test_repreview_refreshes_changes_from_another_tab(self):
        self.page.locator('#update-file').set_input_files({'name':'update.json','mimeType':'application/json','buffer':json.dumps(self.packet()).encode()})
        other=self.context.new_page();other.goto(self.url);other.locator('#task-text').fill('其他标签页的新待办');other.get_by_role('button',name='添加待办',exact=True).click()
        expect(other.locator('#tasks-list')).to_contain_text('其他标签页的新待办')
        self.page.locator('#update-apply').click()
        expect(self.page.locator('#update-dialog')).to_be_visible()
        expect(self.page.locator('#update-error')).to_contain_text('已有变化')
        self.page.get_by_role('button',name='重新预览',exact=True).click()
        expect(self.page.locator('#update-error')).to_have_text('')
        self.page.locator('#update-apply').click()
        expect(self.page.locator('#update-dialog')).not_to_be_visible()
        expect(self.page.locator('#tasks-list')).to_contain_text('其他标签页的新待办')
        expect(self.page.locator('.goal-card').filter(has_text='合成长期目标')).to_be_visible()
        other.close()

    def test_new_archive_preview_exposes_content_as_safe_text(self):
        p=self.packet();p['records']['archives'][0]['question']='<img src=x onerror="window.attacked=1"> 预览正文'
        self.page.locator('#update-file').set_input_files({'name':'update.json','mimeType':'application/json','buffer':json.dumps(p).encode()})
        row=self.page.locator('.update-row').filter(has_text='合成学习断点')
        row.locator('summary').filter(has_text='查看新增内容').click()
        expect(row).to_contain_text('预览正文')
        self.assertEqual(row.locator('img').count(),0)
        self.assertIsNone(self.page.evaluate('window.attacked'))
