"""Browser regression tests: python3 -m unittest discover -s tests -v
Requires Python Playwright and Chromium (CHROMIUM_PATH can override the executable).
"""
import base64
import functools
import http.server
import json
import os
from pathlib import Path
import struct
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='

def day(date='2026-10-10', memo='기존 기록'):
    return dict(date=date, memo=memo, meals={k:dict(status='none',items='',photo='',snack=dict(items='',photo='')) for k in ('breakfast','lunch','dinner')})

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

class JournalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.url=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start()
        cls.browser=cls.pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.ctx=self.browser.new_context(viewport={'width':1280,'height':900},timezone_id='Asia/Seoul')
        self.page=self.ctx.new_page();self.errors=[];self.dialogs=[]
        self.page.on('pageerror',lambda e:self.errors.append(str(e)))
        def accept(d): self.dialogs.append(d.message);d.accept()
        self.page.on('dialog',accept)
        self.page.goto(self.url+'/journal/')
        expect(self.page.locator('#forms .meal')).to_have_count(3)
    def tearDown(self):
        self.ctx.close();self.assertEqual(self.errors,[])
    def seed(self,name,rows):
        self.page.evaluate('''async ({name,rows})=>{const db=await openDb(name);await new Promise((ok,no)=>{const tx=db.transaction('days','readwrite');for(const row of rows)tx.objectStore('days').put(row);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)});db.close()}''',dict(name=name,rows=rows))
    def rows(self,name='meal-journal-v2'):
        return self.page.evaluate('async name=>{const db=await openDb(name);const rows=await dbAll(db);db.close();return rows}',name)
    def upload(self,src):
        self.page.locator('#restorefile').set_input_files(dict(name='backup.json',mimeType='application/json',buffer=json.dumps(src).encode()))
        self.page.wait_for_function('!busy')
    def test_legacy_copy_preserves_source_notes_photos_and_conflicts(self):
        old=dict(date='2026-10-10',note='옛 하루 메모',meals=dict(breakfast=dict(menu='토스트',memo='식사 메모',photo=PHOTO),afternoonSnack=dict(menu='차',memo='간식 메모',photo=None)))
        other=dict(old,date='2026-10-11')
        existing=day()
        self.seed('daily-meal-journal',[old,other]);self.seed('meal-journal-v2',[existing])
        self.page.locator('#legacy').click();expect(self.page.locator('#status')).to_have_text('1일 추가 · 기존 1일 보존')
        self.assertEqual(self.rows('daily-meal-journal'),[old,other])
        rows=self.rows();self.assertEqual(rows[0],existing)
        self.assertEqual(rows[1]['meals']['breakfast']['photo'],PHOTO)
        self.assertEqual(rows[1]['meals']['breakfast']['memo'],'식사 메모')
        self.assertEqual(rows[1]['meals']['lunch']['snack']['memo'],'간식 메모')
        self.page.locator('#legacy').click();expect(self.page.locator('#status')).to_have_text('0일 추가 · 기존 2일 보존')
    def test_valid_backups_preserve_existing_dates_and_invalid_batch_is_atomic(self):
        existing=day();self.seed('meal-journal-v2',[existing])
        self.upload(dict(app='meal-journal-v2',days=[day(memo='덮어쓰기 금지'),day('2026-10-11')]))
        self.assertEqual(self.rows()[0],existing)
        self.assertEqual([r['date'] for r in self.rows()],['2026-10-10','2026-10-11'])
        before=self.rows()
        for bad in [day('2026-02-30'),day('bad'),day('2026-10-12') | {'memo':42}]:
            self.upload(dict(app='meal-journal-v2',days=[day('2026-10-13'),bad]))
            self.assertEqual(self.rows(),before)
        unsafe=day('2026-10-14');unsafe['meals']['breakfast']['photo']='https://example.com/tracker.png'
        self.upload(dict(app='meal-journal-v2',days=[unsafe]));self.assertEqual(self.rows(),before)
        self.assertTrue(any('실패' in d for d in self.dialogs))
    def test_all_meals_snacks_photos_notes_reload_and_backup(self):
        for k in ('breakfast','lunch','dinner'):
            self.page.locator(f'[data-id="{k}"][data-state="logged"]').click()
            self.page.locator(f'[data-items="{k}"]').fill(k+' 식사')
            self.page.locator(f'[data-meal-memo="{k}"]').fill('식사 메모')
            self.page.locator(f'[data-snack-toggle="{k}"]').click()
            self.page.locator(f'[data-snack="{k}"]').fill(k+' 후식')
            self.page.locator(f'[data-snack-memo="{k}"]').fill('후식 메모')
        self.page.locator('[data-file="dinner"][data-kind="snack"]').set_input_files(dict(name='photo.png',mimeType='image/png',buffer=base64.b64decode(PHOTO.split(',')[1])))
        self.page.wait_for_function('!photoPending')
        self.page.locator('#memo').fill('하루 메모')
        # Backup immediately, before the debounce fires.
        with self.page.expect_download() as download:self.page.locator('#backup').click()
        backup=json.loads(Path(download.value.path()).read_text())
        self.assertEqual(backup['days'][0]['memo'],'하루 메모')
        self.assertTrue(backup['days'][0]['meals']['dinner']['snack']['photo'].startswith('data:image/jpeg'))
        self.page.reload();expect(self.page.locator('#memo')).to_have_value('하루 메모')
        for k in ('breakfast','lunch','dinner'):
            expect(self.page.locator(f'[data-snack="{k}"]')).to_have_value(k+' 후식')
        with self.page.expect_download() as download:self.page.locator('#download').click()
        png=Path(download.value.path()).read_bytes();self.assertEqual(struct.unpack('>II',png[16:24]),(1080,1350))
        # Delete and restore a real downloaded backup.
        self.page.locator('#clear').click();expect(self.page.locator('#memo')).to_have_value('')
        self.upload(backup);expect(self.page.locator('#memo')).to_have_value('하루 메모')
    def test_canvas_optional_sections_centering_and_vertical_order(self):
        def draw(d):
            return self.page.evaluate('''d=>{const calls=[],original=c.fillText;c.fillText=function(text,x,y){calls.push({text,x,y,align:this.textAlign});return original.apply(this,arguments)};paint(normalize(d,d.date),MEALS.map(()=>({main:null,snack:null})));c.fillText=original;return calls}''',d)
        d=day(memo='');calls=draw(d)
        absent=[x for x in calls if x['text']=='식사하지 않았어요']
        self.assertEqual(len(absent),3);self.assertTrue(all(x['x']==540 and x['align']=='center' for x in absent))
        self.assertEqual([x['y'] for x in absent],sorted(x['y'] for x in absent))
        self.assertFalse(any('간식 / 후식' in x['text'] or '하루 메모' in x['text'] or 'A LITTLE DAILY' in x['text'] for x in calls))
        d['memo']='메모 내용';d['meals']['dinner']['snack']['items']='저녁 후식';calls=draw(d)
        self.assertEqual(sum('간식 / 후식' in x['text'] for x in calls),1)
        self.assertTrue(any(x['text']=='메모 내용' for x in calls))
    def test_reference_photo_layout_and_bundled_font(self):
        result=self.page.evaluate('''async photoSrc=>{
            await posterFontReady;
            const d=blank('2026-11-02');d.meals.breakfast.status='logged';
            d.meals.breakfast.items='스크램블 에그\\n통밀 토스트';
            d.meals.breakfast.photo=photoSrc;d.meals.breakfast.snack.photo=photoSrc;
            d.meals.breakfast.snack.items='블루베리 요거트';
            const image=await load(photoSrc),boxes=[],original=c.roundRect;
            c.roundRect=function(x,y,w,h){boxes.push({x,y,w,h});return original.apply(this,arguments)};
            paint(d,[{main:image,snack:image},{main:null,snack:null},{main:null,snack:null}]);
            c.roundRect=original;
            return {font:document.fonts.check('700 36px "JournalHand"'),boxes};
        }''',PHOTO)
        self.assertTrue(result['font'])
        main=[r for r in result['boxes'] if r['x']==59 and r['w']==460]
        snack=[r for r in result['boxes'] if r['x']==764 and r['w']==248]
        self.assertEqual(len(main),1);self.assertEqual(len(snack),1)
        self.assertGreater(main[0]['h'],250)
        self.assertGreater(snack[0]['h'],150)

    def test_fresh_entry_shares_existing_data_without_migration(self):
        self.assertEqual((ROOT/'journal/index.html').read_bytes(),(ROOT/'journal/reference.html').read_bytes())
        self.page.locator('#memo').fill('보존할 기록')
        self.page.locator('#save').click()
        expect(self.page.locator('#status')).to_contain_text('저장 완료')
        before=self.rows()
        self.page.goto(self.url+'/journal/reference.html')
        expect(self.page.locator('#memo')).to_have_value('보존할 기록')
        self.assertEqual(self.rows(),before)
        self.assertTrue(self.page.evaluate('async()=>{await posterFontReady;return document.fonts.check(\'700 36px "JournalHand"\')}'))

    def test_calendar_save_failure_keeps_input_and_date(self):
        self.page.locator('#memo').fill('잃으면 안 되는 입력')
        selected=self.page.evaluate('selected')
        self.page.evaluate('()=>{window.realPut=put;put=async()=>{throw Error("simulated storage failure")}}')
        self.page.locator('#dates button:not(.selected)').first.click()
        expect(self.page.locator('#status')).to_contain_text('저장 실패')
        self.assertEqual(self.page.evaluate('selected'),selected)
        expect(self.page.locator('#memo')).to_have_value('잃으면 안 되는 입력')
        self.page.evaluate('()=>{put=window.realPut}')
        self.page.locator('#save').click();expect(self.page.locator('#status')).to_contain_text('저장 완료')
    def test_desktop_mobile_and_original_app(self):
        for width in (1280,360):
            self.page.set_viewport_size(dict(width=width,height=900))
            self.assertTrue(self.page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        self.page.goto(self.url+'/')
        self.page.get_by_role('button',name='아침 기록 추가',exact=True).click()
        self.page.locator('#menu').fill('기존 화면 식사');self.page.locator('#save-meal').click()
        expect(self.page.locator('#meal-dialog')).not_to_be_visible()
        self.page.reload();expect(self.page.locator('.meal-name').first).to_have_text('기존 화면 식사')

if __name__=='__main__': unittest.main()
