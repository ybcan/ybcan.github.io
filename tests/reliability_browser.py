"""Durability acceptance checks using real IndexedDB and browser filesystem handles."""
import json
import strategy_browser
from playwright.sync_api import expect

class ReliabilityTests(strategy_browser.StrategyTests):
    def test_directory_backup_and_restore_from_version(self):
        self.page.evaluate('''() => { window.showDirectoryPicker = async () => navigator.storage.getDirectory(); }''')
        self.page.locator('#settings-button').click()
        self.page.locator('#backup-connect').click()
        expect(self.page.locator('#backup-status')).to_contain_text('已写入')
        self.page.locator('#settings-close').click()
        self.page.locator('#task-text').fill('目录备份中的任务')
        self.page.get_by_role('button',name='添加待办',exact=True).click()
        self.page.locator('#settings-button').click()
        self.page.locator('#backup-now').click()
        expect(self.page.locator('#backup-status')).to_contain_text('已写入')
        self.page.locator('#backup-refresh').click()
        expect(self.page.locator('#backup-versions option')).to_have_count(2)
        self.page.locator('#backup-versions').select_option(index=1)
        self.page.locator('#backup-restore').click()
        self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#settings-message')).to_contain_text('已恢复')
        self.page.locator('#settings-close').click()
        expect(self.page.locator('#tasks-list')).not_to_contain_text('目录备份中的任务')

    def test_clock_reload_preserves_running_and_paused_time(self):
        self.page.locator('#focus-toggle').click()
        self.page.wait_for_timeout(1100)
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        expect(self.page.locator('#focus-toggle')).to_have_attribute('aria-label','暂停专注')
        expect(self.page.locator('#focus-time')).not_to_have_text('25:00')
        self.page.locator('#focus-toggle').click()
        value=self.page.locator('#focus-time').inner_text()
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        expect(self.page.locator('#focus-toggle')).to_have_attribute('aria-label','开始专注')
        expect(self.page.locator('#focus-time')).to_have_text(value)

    def test_fold_preference_and_archive_pagination(self):
        p=self.packet();p['records']['archives']=[dict(p['records']['archives'][0],id=f'round-{i}',title=f'分页学习记录 {i:02}',question=f'问题 {i}') for i in range(45)]
        self.import_packet(p)
        self.page.locator('#fold-learning-workspace').click()
        expect(self.page.locator('#projects-list')).not_to_be_visible()
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        expect(self.page.locator('#projects-list')).not_to_be_visible()
        self.page.locator('[data-view="archives"]').click()
        expect(self.page.locator('.archive-card')).to_have_count(20)
        self.page.locator('#archive-next').click()
        expect(self.page.locator('#archive-page')).to_contain_text('2 / 3')
        self.page.locator('#global-search').fill('分页学习记录 44')
        expect(self.page.locator('.archive-card')).to_have_count(1)
        expect(self.page.locator('#archive-page')).to_contain_text('1 / 1')

    def test_about_has_release_and_license_information(self):
        self.page.locator('#about-button').click()
        expect(self.page.locator('#about-dialog')).to_contain_text('0.5.1')
        expect(self.page.locator('#about-dialog')).to_contain_text('ybcan')
        expect(self.page.get_by_role('link',name='MIT 许可证')).to_be_visible()

    def test_duplicate_submit_is_saved_once(self):
        self.page.locator('#new-goal').click()
        self.page.locator('#strategy-title').fill('快速提交的新目标')
        self.page.locator('#strategy-dialog form').evaluate('(form)=>{form.requestSubmit();form.requestSubmit();}')
        expect(self.page.locator('#strategy-dialog')).not_to_be_visible()
        expect(self.page.locator('.goal-card').filter(has_text='快速提交的新目标')).to_have_count(1)

    def test_restore_confirmation_cannot_overwrite_a_concurrent_edit(self):
        self.page.locator('#settings-button').click()
        with self.page.expect_download() as download:
            self.page.locator('#export-button').click()
        backup=__import__('pathlib').Path(download.value.path()).read_bytes()
        self.page.locator('#import-file').set_input_files({'name':'before.json','mimeType':'application/json','buffer':backup})
        expect(self.page.locator('#confirm-dialog')).to_be_visible()
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for()
        self.open_notes(other)
        other.locator('#note-text').fill('确认期间的新记录');other.locator('#note-save').click()
        self.open_notes(other)
        expect(other.locator('#notes-list')).to_contain_text('确认期间的新记录')
        self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#settings-message')).to_contain_text('已有变化')
        self.page.locator('#settings-close').click();self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        self.open_notes()
        expect(self.page.locator('#notes-list')).to_contain_text('确认期间的新记录')
        other.close()

    def test_invalid_file_is_preserved_without_replacing_the_workspace(self):
        self.page.evaluate('''async () => {
            const dir=await navigator.storage.getDirectory();
            const file=await dir.getFileHandle('strategy-workbench-damaged.json',{create:true});
            const w=await file.createWritable();await w.write('{broken');await w.close();
            window.showDirectoryPicker=async()=>dir;
        }''')
        self.page.locator('#settings-button').click();self.page.locator('#backup-connect').click()
        expect(self.page.locator('#backup-status')).to_contain_text('历史备份')
        expect(self.page.locator('#backup-versions option')).to_have_count(1)
        self.page.locator('#backup-restore').click()
        expect(self.page.locator('#backup-status')).to_contain_text('不是有效')
        self.page.locator('#settings-close').click()
        expect(self.page.locator('.goal-card')).to_have_count(2)

    def test_stale_restore_protects_the_latest_committed_data(self):
        self.page.evaluate('() => { window.showDirectoryPicker=async()=>navigator.storage.getDirectory(); }')
        self.page.locator('#settings-button').click();self.page.locator('#backup-connect').click()
        expect(self.page.locator('#backup-status')).to_contain_text('已写入')
        with self.page.expect_download() as download:self.page.locator('#export-button').click()
        raw=__import__('pathlib').Path(download.value.path()).read_bytes()
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for()
        self.open_notes(other)
        other.locator('#note-text').fill('恢复前其他标签页的重要修改');other.locator('#note-save').click()
        self.open_notes(other)
        expect(other.locator('#notes-list')).to_contain_text('恢复前其他标签页的重要修改')
        self.page.locator('#import-file').set_input_files({'name':'old.json','mimeType':'application/json','buffer':raw})
        self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#settings-message')).to_contain_text('已恢复')
        protected=self.page.evaluate('''async()=>{const d=await navigator.storage.getDirectory();const texts=[];for await(const f of d.values())if(f.kind==='file')texts.push(await(await f.getFile()).text());return texts;}''')
        self.assertTrue(any('恢复前其他标签页的重要修改' in text for text in protected))
        other.close()

    def test_reset_rejects_a_repair_saved_after_the_corrupt_snapshot(self):
        self.page.evaluate('''async()=>{const s=await(await import('#workbench/storage')).openWorkspaceStore();await s.update(()=>'{broken');}''')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        self.page.locator('#settings-button').click();self.page.locator('#reset-workspace').click()
        expect(self.page.locator('#confirm-dialog')).to_be_visible()
        self.page.evaluate('''async()=>{const {openWorkspaceStore}=await import('#workbench/storage');const {createWorkspace,serializeBackup}=await import('#workbench/workspace');const state=createWorkspace(false);state.notes.push({id:'repair',body:'其他标签页修复后的记录',direction:''});await(await openWorkspaceStore()).update(()=>serializeBackup(state));}''')
        self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#settings-message')).to_contain_text('变化')
        raw=self.page.evaluate('async()=>await(await(await import("#workbench/storage")).openWorkspaceStore()).read()')
        self.assertIn('其他标签页修复后的记录',raw)

    def test_stale_delete_does_not_remove_a_record_edited_in_another_tab(self):
        self.page.locator('#tasks-list').get_by_role('button',name='编辑任务：读完一篇前沿文章',exact=True).click()
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for()
        other.locator('#tasks-list').get_by_role('button',name='编辑任务：读完一篇前沿文章',exact=True).click()
        other.locator('#record-title').fill('其他标签页修改后的待办');other.locator('#record-submit').click()
        expect(other.locator('#record-dialog')).not_to_be_visible()
        self.page.locator('#record-delete').click();self.page.locator('#confirm-accept').click()
        expect(self.page.locator('#toast')).to_contain_text('变化')
        raw=self.page.evaluate('async()=>await(await(await import("#workbench/storage")).openWorkspaceStore()).read()')
        self.assertIn('其他标签页修改后的待办',raw)
        other.close()

    def test_startup_read_failure_still_allows_export_and_recovery_ui(self):
        self.page.add_init_script('''(()=>{const original=IDBObjectStore.prototype.get;let once=true;IDBObjectStore.prototype.get=function(...args){const req=original.apply(this,args);if(once){once=false;req.addEventListener('success',()=>req.transaction.abort());}return req;};})()''')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        expect(self.page.locator('#storage-alert')).to_be_visible()
        self.page.locator('#settings-button').click()
        expect(self.page.locator('#export-button')).to_be_visible()

    def test_corrupt_working_copy_is_not_automatically_backed_up(self):
        self.page.evaluate('() => { window.showDirectoryPicker=async()=>navigator.storage.getDirectory(); }')
        self.page.locator('#settings-button').click();self.page.locator('#backup-connect').click()
        expect(self.page.locator('#backup-status')).to_contain_text('已写入')
        self.page.evaluate('async()=>await(await(await import("#workbench/storage")).openWorkspaceStore()).update(()=>"{broken")')
        self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        self.page.locator('#settings-button').click();self.page.locator('#backup-now').click()
        expect(self.page.locator('#backup-status')).to_contain_text('异常')
        self.page.locator('#backup-refresh').click()
        expect(self.page.locator('#backup-versions option')).to_have_count(1)

    def test_focus_reset_is_saved_before_reload(self):
        self.page.locator('#focus-toggle').click();self.page.wait_for_timeout(1100)
        self.page.locator('#focus-reset').click();self.page.reload();self.page.locator('html[data-ready="true"]').wait_for()
        expect(self.page.locator('#focus-toggle')).to_have_attribute('aria-label','开始专注')
        expect(self.page.locator('#focus-time')).to_have_text('25:00')

    def test_stale_task_completion_reports_conflict(self):
        title='读完一篇前沿文章'
        other=self.context.new_page();other.goto(self.url);other.locator('html[data-ready="true"]').wait_for()
        other.locator('#tasks-list').get_by_role('button',name='编辑任务：'+title,exact=True).click();other.locator('#record-adoption').select_option('candidate');other.locator('#record-submit').click();expect(other.locator('#record-dialog')).not_to_be_visible()
        self.page.locator('#tasks-list').get_by_role('checkbox',name='完成任务：'+title,exact=True).check()
        expect(self.page.locator('#toast')).to_contain_text('变化');other.close()
