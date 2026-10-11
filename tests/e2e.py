"""端對端測試:用真實瀏覽器操作教材,檢查三個模式與老師模式。

用法:  python3 tests/e2e.py
需要:  pip install playwright;環境變數 CHROME_PATH 可指定瀏覽器(預設 macOS 的 Chrome)。
"""
import os
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = (ROOT / "經緯度互動教材.html").as_uri()
CHROME = os.environ.get("CHROME_PATH", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")

failures = []


def check(name, condition, detail=""):
    print(("PASS " if condition else "FAIL ") + name + (f"  {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(name)


def pixel(pg, lon, lat):
    return pg.evaluate(f"makePointer(lastFrame)({lon},{lat})")


def click_map(pg, box, lon, lat):
    x, y = pixel(pg, lon, lat)
    pg.mouse.click(box[0] + x, box[1] + y)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME, headless=True)
    pg = browser.new_page(viewport={"width": 1360, "height": 820})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.goto(URL)
    pg.wait_for_timeout(500)
    box = pg.eval_on_selector("#map", "e=>{const r=e.getBoundingClientRect();return [r.left,r.top]}")

    # --- 資料一致性
    check("城市時區與經度一致", pg.evaluate("CITIES.every(c => zoneOfLon(c.lon) === c.zone)"))

    # --- 模式 1
    click_map(pg, box, 121.5, 25.0)
    check("點台北讀出座標", pg.evaluate("st.clicked && st.clicked.name") == "台北")
    check("台北任務自動完成", pg.evaluate("st.doneTasks.has('taipei-click')"))
    c0 = pg.evaluate("st.center")
    pg.mouse.move(box[0] + 400, box[1] + 300)
    pg.mouse.down()
    pg.mouse.move(box[0] + 300, box[1] + 300, steps=6)
    pg.mouse.up()
    check("拖曳旋轉地球", pg.evaluate("st.center")[0] > c0[0])
    pg.focus("#map")
    c1 = pg.evaluate("st.center[0]")
    pg.keyboard.press("ArrowRight")
    check("方向鍵旋轉地球", pg.evaluate("st.center[0]") > c1)
    pg.click("text=展開成平面地圖")
    pg.wait_for_timeout(3000)
    check("展開成平面地圖", pg.evaluate("st.t") == 1)
    check("展開任務完成", pg.evaluate("st.doneTasks.has('flatten')"))
    click_map(pg, box, 170, 10)
    check("平面地圖點擊:東經卻是西半球任務", pg.evaluate("st.doneTasks.has('east-but-west')"))

    # --- 模式 2
    pg.click("text=② 看見時間流動")
    pg.wait_for_timeout(3200)
    pg.evaluate("st.anim=null;st.t=0;requestFrame()")
    check("模式二預設 台北白天", pg.evaluate("isCityInDay(cityById('taipei'))"))
    pg.evaluate("setTimeOfDay(720)")
    check("倫敦 12:00 任務", pg.evaluate("st.doneTasks.has('london-noon')"))
    pg.focus("#map")
    u0 = pg.evaluate("st.utcMin")
    pg.keyboard.press("ArrowRight")
    check("方向鍵調整時間", pg.evaluate("st.utcMin") == u0 + 30)
    pg.keyboard.press("Space")
    check("空白鍵播放", pg.evaluate("st.playing"))
    pg.keyboard.press("Space")
    pg.evaluate("setSeason('june')")
    check("夏至:北極圈整天白天", all(
        pg.evaluate(f"isDaylight(80, 20, {h * 60}, st.season)") for h in (0, 6, 12, 18)))
    check("夏至任務完成", pg.evaluate("st.doneTasks.has('midnight-sun')"))
    pg.evaluate("st.layers=new Set(['daynight','zones','zoneTimes']);st.t=1;requestFrame()")
    pg.wait_for_timeout(300)
    check("平面圖+夏至可繪製", pg.evaluate("lastFrame.kind") == "flat")

    # --- 模式 3
    pg.click("text=③ 東加西減演練")
    pg.wait_for_timeout(3200)
    pg.select_option("select[aria-label='猜日期']", "-1")
    pg.select_option("select[aria-label='猜時間']", "19")
    pg.click("text=揭曉答案")
    check("台北→紐約 答對", "答對了" in pg.inner_text(".verdict"))
    pg.click("text=← 往西走")
    check("換方向仍顯示結果", pg.query_selector(".verdict") is not None)
    pg.click("text=🎲 隨機出一題")
    check("隨機出題後重置預測", pg.evaluate("st.calc.revealed") is False)
    check("隨機出題 A≠B", pg.evaluate("st.calc.a.id !== st.calc.b.id"))

    # --- 模式 4:由時間找經度
    pg.click("text=④ 由時間找經度")
    pg.wait_for_timeout(3200)
    check("模式四固定平面地圖", pg.evaluate("st.t") == 1)
    check("題目有顯示", "倫敦現在是" in pg.inner_text(".big-question"))
    check("答題前不能檢查", pg.evaluate("document.querySelector('.primary-btn[disabled]') !== null"))
    zone = pg.evaluate("st.lonQuiz.question.zone")
    wrong_zone = zone + 3 if zone + 3 <= 12 else zone - 3
    for attempt, z, expect in (("先點錯", wrong_zone, False), ("再點對", zone, True)):
        click_map(pg, box, z * 15, 20)
        pg.click("button:has-text('檢查答案')")
        ok = pg.evaluate("st.lonQuiz.checked && st.lonQuiz.correct")
        checked = pg.evaluate("st.lonQuiz.checked")
        check(f"模式四{attempt}:判定{'正確' if expect else '錯誤'}", checked and ok == expect)
    check("答對後顯示解題步驟", pg.query_selector(".steps") is not None)
    check("答對後顯示答案城市", pg.evaluate("st.lonQuiz.solved") == 1)
    check("模式四任務:第一題", pg.evaluate("st.doneTasks.has('lon-first')"))
    pg.click("text=🎲 換一題")
    check("換一題後清除作答", pg.evaluate("!st.lonQuiz.checked && st.clicked === null"))
    pg.click("text=💡 提示")
    check("提示出現", "提示:兩地相差" in pg.inner_text("#panel"))
    solved_noon = False
    for _ in range(40):  # 抽到「正午題」為止,驗證該題型也能通過
        if pg.evaluate("st.lonQuiz.question.kind") == "noon":
            z = pg.evaluate("st.lonQuiz.question.zone")
            click_map(pg, box, z * 15, -10)
            pg.click("button:has-text('檢查答案')")
            solved_noon = pg.evaluate("st.lonQuiz.correct")
            break
        pg.click("text=🎲 換一題")
    check("正午題可解且任務完成", solved_noon and pg.evaluate("st.doneTasks.has('lon-noon')"))

    # --- 老師模式
    pg.click("#teacherBtn")
    check("老師卡片出現", pg.query_selector(".teacher-card") is not None)
    pg.click("text=鎖定圖層")
    check("鎖定後圖層不可改", pg.evaluate("Object.values(ui.layerInputs).every(i => i.disabled)"))
    pg.click("text=大字")
    check("大字模式", pg.evaluate("document.body.classList.contains('big')"))
    pg.click("text=對答案:顯示時區")
    check("課堂預設套用圖層", pg.evaluate("st.layers.has('zones') && st.layers.has('zoneNums')"))
    pg.click("#teacherBtn")
    check("關閉老師模式解除鎖定", pg.evaluate("!st.lockLayers && !st.bigText"))

    # --- 重設
    pg.click("#resetBtn")
    check("重設回到模式一", pg.evaluate("[st.mode, st.t, st.doneTasks.size]") == [1, 0, 0])

    check("全程沒有 JS 錯誤", not errors, str(errors))
    browser.close()

print(f"\n{'全部通過' if not failures else '失敗: ' + ', '.join(failures)}")
sys.exit(1 if failures else 0)
