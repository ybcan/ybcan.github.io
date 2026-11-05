"""Edit/delete acceptance coverage, with synthetic records only."""
import hierarchy_browser
from playwright.sync_api import expect

class EditingTests(hierarchy_browser.HierarchyTests):
    def stored(self):
        return self.page.evaluate('async()=>JSON.parse(await(await(await import("#workbench/storage")).openWorkspaceStore()).read()).data')

    def test_edit_and_delete_goal_preserves_children_and_can_cancel(self):
        self.import_packet(self.tree_packet())
        self.page.locator('.goal-card').filter(has_text='合成长期目标').get_by_role('button',name='合成长期目标',exact=True).click()
        row=self.page.locator('.hierarchy-record[data-key="goals:goal-x"]')
        row.get_by_role('button',name='编辑',exact=True).click();self.page.locator('#strategy-title').fill('更新后的长期目标');self.page.locator('#strategy-save').click()
        expect(row).to_contain_text('更新后的长期目标')
        row.get_by_role('button',name='编辑',exact=True).click();self.page.locator('#strategy-delete').click();self.page.locator('#confirm-cancel').click()
        expect(self.page.locator('#strategy-dialog')).to_be_visible();self.assertTrue(any(g['id']=='goal-x' for g in self.stored()['goals']))
        self.page.locator('#strategy-delete').click();self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#strategy-dialog')).not_to_be_visible()
        self.assertFalse(any(g['id']=='goal-x' for g in self.stored()['goals']))
        self.assertTrue(any(a['id']=='round-x' for a in self.stored()['archives']))
        expect(self.page.locator('#strategy-tree')).to_contain_text('合成实践项目')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for();self.assertFalse(any(g['id']=='goal-x' for g in self.stored()['goals']))

    def test_edit_archive_then_delete_only_that_record_and_edit_delete_task(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="archives"]').click()
        self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='编辑',exact=True).click()
        self.page.locator('#strategy-answer').fill('保存后的学习回答');self.page.locator('#strategy-save').click();expect(self.page.locator('#strategy-dialog')).not_to_be_visible()
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for();self.page.locator('[data-view="archives"]').click()
        self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='编辑',exact=True).click();expect(self.page.locator('#strategy-answer')).to_have_value('保存后的学习回答')
        self.page.locator('#strategy-delete').click();self.page.locator('#confirm-accept').click();expect(self.page.locator('#strategy-dialog')).not_to_be_visible()
        self.assertFalse(any(a['id']=='round-x' for a in self.stored()['archives']));self.assertTrue(any(p['id']=='project-x' for p in self.stored()['projects']))
        self.page.locator('[data-view="tasks"]').click();self.page.get_by_role('button',name='编辑待办：读完一篇前沿文章',exact=True).click()
        self.page.locator('#record-title').fill('修改后的待办');self.page.locator('#record-submit').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        self.page.get_by_role('button',name='编辑待办：修改后的待办',exact=True).click();self.page.locator('#record-delete').click();self.page.locator('#confirm-accept').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        self.assertFalse(any(t['title']=='修改后的待办' for t in self.stored()['tasks']))

    def test_delete_linked_project_preserves_stage_and_archive(self):
        self.import_packet(self.tree_packet());self.page.locator('[data-view="learning"]').click()
        self.page.locator('.hierarchy-record[data-key="projects:project-x"]').get_by_role('button',name='编辑',exact=True).click();self.page.locator('#record-delete').click();self.page.locator('#confirm-accept').click();expect(self.page.locator('#record-dialog')).not_to_be_visible()
        saved=self.stored();self.assertFalse(any(p['id']=='project-x' for p in saved['projects']));self.assertTrue(any(p['id']=='child-x' for p in saved['projects']));self.assertTrue(any(p['id']=='plan-x' for p in saved['plans']));self.assertEqual(next(a for a in saved['archives']if a['id']=='round-x')['projectId'],'')

    def test_stale_goal_deletion_cannot_overwrite_another_tabs_edit(self):
        self.import_packet(self.tree_packet());self.page.locator('.goal-card').filter(has_text='合成长期目标').get_by_role('button',name='编辑',exact=True).click();self.page.locator('#strategy-delete').click()
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for()
        other.locator('.goal-card').filter(has_text='合成长期目标').get_by_role('button',name='编辑',exact=True).click();other.locator('#strategy-title').fill('另一标签页保留的目标');other.locator('#strategy-save').click();expect(other.locator('#strategy-dialog')).not_to_be_visible()
        self.page.locator('#confirm-accept').click();expect(self.page.locator('#strategy-dialog')).to_be_visible();self.assertEqual(next(g for g in self.stored()['goals']if g['id']=='goal-x')['title'],'另一标签页保留的目标');other.close()

    def test_title_only_archive_edit_preserves_independent_links_and_confirmed_status(self):
        packet=self.tree_packet();packet['records']['archives'][0].update({'goalIds':['goal-y'],'directionIds':['invest'],'status':'verify','statusMode':'confirmed'})
        self.import_packet(packet);self.page.locator('[data-view="archives"]').click();self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='编辑',exact=True).click()
        self.page.locator('#strategy-title').fill('只改标题后的归档');self.page.locator('#strategy-save').click();expect(self.page.locator('#strategy-dialog')).not_to_be_visible()
        record=next(a for a in self.stored()['archives']if a['id']=='round-x')
        self.assertEqual(record['goalIds'],['goal-y']);self.assertEqual(record['directionIds'],['invest']);self.assertEqual(record['status'],'verify');self.assertEqual(record['statusMode'],'confirmed')

    def test_failed_storage_does_not_claim_or_apply_goal_archive_or_task_deletion(self):
        self.import_packet(self.tree_packet())
        self.page.evaluate("() => { IDBObjectStore.prototype.put = function() { throw new DOMException('quota', 'QuotaExceededError'); }; }")
        self.page.locator('.goal-card').filter(has_text='合成长期目标').get_by_role('button',name='编辑',exact=True).click();self.page.locator('#strategy-delete').click();self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#strategy-dialog')).to_be_visible();expect(self.page.locator('#strategy-dialog .form-error')).to_contain_text('记录已保留');self.page.get_by_role('button',name='关闭详情窗口',exact=True).click()
        self.page.locator('[data-view="archives"]').click();self.page.locator('.archive-card').filter(has_text='合成学习断点').get_by_role('button',name='编辑',exact=True).click();self.page.locator('#strategy-delete').click();self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#strategy-dialog')).to_be_visible();expect(self.page.locator('#strategy-dialog .form-error')).to_contain_text('记录已保留');self.page.get_by_role('button',name='关闭详情窗口',exact=True).click()
        self.page.locator('[data-view="tasks"]').click();self.page.get_by_role('button',name='编辑待办：读完一篇前沿文章',exact=True).click();self.page.locator('#record-delete').click();self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#record-dialog')).to_be_visible();expect(self.page.locator('#record-error')).to_contain_text('记录已保留');expect(self.page.locator('#toast')).not_to_have_text('记录已删除')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for();saved=self.stored();self.assertTrue(any(g['id']=='goal-x'for g in saved['goals']));self.assertTrue(any(a['id']=='round-x'for a in saved['archives']));self.assertTrue(any(t['title']=='读完一篇前沿文章'for t in saved['tasks']))
