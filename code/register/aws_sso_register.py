#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AWS IAM Identity Center 用户注册脚本
使用 Selenium 模拟浏览器操作
"""
import os
import sys
import io
import time
import random
import string
import argparse

# 修复 Windows 编码问题
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ================= 配置区 =================
AWS_SSO_URL = "https://us-east-1.console.aws.amazon.com/singlesignon/home?region=us-east-1#/instances/72234076f09f803e/users"
AWS_LOGIN_URL = "https://aws.amazon.com/cn/console/"
DEFAULT_PASSWORD = "4561230wW?"

# ================= 工具函数 =================

def log(msg, level="INFO"):
    """输出日志"""
    try:
        print(f"[{time.strftime('%H:%M:%S')}] [{level}] {msg}", flush=True)
    except UnicodeEncodeError:
        safe_msg = msg.encode('ascii', 'ignore').decode('ascii')
        print(f"[{time.strftime('%H:%M:%S')}] [{level}] {safe_msg}", flush=True)


def generate_random_name():
    """生成随机名字"""
    first_names = ["John", "Jane", "Alex", "Chris", "Sam", "Taylor", "Jordan", "Morgan", "Casey", "Riley"]
    last_names = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson"]
    return random.choice(first_names), random.choice(last_names)


def generate_random_email(domain="gmail.com"):
    """生成随机邮箱"""
    chars = string.ascii_lowercase + string.digits
    username = ''.join(random.choice(chars) for _ in range(10))
    return f"{username}@{domain}"


def human_type(element, text, min_delay=0.05, max_delay=0.15):
    """模拟人类打字"""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))


def random_sleep(min_sec=1, max_sec=3):
    """随机等待"""
    time.sleep(random.uniform(min_sec, max_sec))


def save_user_to_file(user_info, filename="created_users.txt"):
    """
    追加保存用户信息到本地文件
    只保存邮箱和密码
    """
    try:
        with open(filename, 'a', encoding='utf-8') as f:
            email = user_info.get('Username') or user_info.get('Email') or ''
            password = user_info.get('One-time_password') or ''
            f.write(f"{email}----{password}\n")
        log(f"[OK] 用户信息已保存到 {filename}")
    except Exception as e:
        log(f"[WARN] 保存用户信息失败: {e}")


# ================= 主要功能 =================

def login_aws_console(driver, wait, username, password):
    """登录 AWS Console"""
    log("正在登录 AWS Console...")

    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC

    driver.get(AWS_LOGIN_URL)
    random_sleep(2, 4)

    try:
        # 输入用户名
        username_input = wait.until(EC.presence_of_element_located((By.ID, "username")))
        human_type(username_input, username)
        random_sleep(0.5, 1)

        # 输入密码
        password_input = driver.find_element(By.ID, "password")
        human_type(password_input, password)
        random_sleep(0.5, 1)

        # 点击登录
        sign_in_btn = driver.find_element(By.ID, "signin_button")
        sign_in_btn.click()

        log("等待登录完成...")
        random_sleep(3, 5)

        # 检查是否登录成功
        if "console.aws.amazon.com" in driver.current_url:
            log("[OK] 登录成功!")
            return True
        else:
            log(f"[WARN] 当前URL: {driver.current_url}")
            return True  # 可能需要额外验证

    except Exception as e:
        log(f"[FAIL] 登录失败: {e}", "ERR")
        return False


def create_user_via_browser(driver, wait, email, given_name, family_name):
    """通过浏览器创建用户"""
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.common.keys import Keys

    log(f"正在创建用户: {email}")

    # 在 try 块外部初始化变量，确保在异常处理时可访问
    otp_password = None
    password_text = None
    popup_data = {}

    try:
        # 访问用户管理页面
        driver.get(AWS_SSO_URL)
        log("等待页面加载...")
        random_sleep(5, 8)

        # 打印当前页面信息用于调试
        log(f"当前URL: {driver.current_url}")
        log(f"页面标题: {driver.title}")

        # AWS Console 使用 awsui 组件，需要特殊处理
        log("[DEBUG] 查找页面元素...")

        # 查找所有包含 "Add user" 文本的元素
        all_elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'Add user') or contains(text(), 'Add User')]")
        log(f"[DEBUG] 找到 {len(all_elements)} 个包含 'Add user' 的元素")

        # 点击 "Add user" 按钮
        log("查找 Add user 按钮...")
        add_user_btn = None

        # 方式1: 通过 span 文本找到父级按钮
        try:
            add_user_btn = driver.find_element(By.XPATH,
                "//span[contains(text(), 'Add user')]/ancestor::button")
            log("方式1找到按钮")
        except:
            pass

        # 方式2: 直接找 span
        if not add_user_btn:
            try:
                spans = driver.find_elements(By.XPATH, "//span[contains(text(), 'Add user')]")
                for span in spans:
                    if span.is_displayed():
                        add_user_btn = span
                        log("方式2找到 span")
                        break
            except:
                pass

        # 方式3: 使用 JavaScript 查找并点击
        if not add_user_btn:
            try:
                result = driver.execute_script("""
                    var elements = document.querySelectorAll('span, button, a, div');
                    for (var i = 0; i < elements.length; i++) {
                        var text = elements[i].innerText || elements[i].textContent;
                        if (text && text.trim() === 'Add user') {
                            elements[i].click();
                            return 'clicked';
                        }
                    }
                    return 'not found';
                """)
                if result == 'clicked':
                    log("方式3 (JS) 直接点击成功")
                    random_sleep(3, 5)
                    # 跳过后面的点击逻辑
                    add_user_btn = "clicked_by_js"
            except Exception as e:
                log(f"方式3失败: {e}")

        if not add_user_btn:
            log("[FAIL] 未找到 Add user 按钮", "ERR")
            # 保存页面源码用于调试
            with open(f"debug_page_{int(time.time())}.html", "w", encoding='utf-8') as f:
                f.write(driver.page_source)
            log("[INFO] 已保存页面源码到 debug_page_*.html")
            driver.save_screenshot(f"debug_no_button_{int(time.time())}.png")
            return False

        if add_user_btn != "clicked_by_js":
            log("点击 Add user 按钮...")
            try:
                add_user_btn.click()
            except:
                driver.execute_script("arguments[0].click();", add_user_btn)
            random_sleep(3, 5)

        # 等待表单加载
        log("等待表单加载...")
        random_sleep(3, 5)

        # 首先点击 "Generate a one-time password" 单选按钮
        # 这个选项必须在填写表单之前选择
        log("查找并点击 'Generate a one-time password' 选项...")
        otp_clicked = False

        # 方法1: 通过 awsui radio 组件查找
        try:
            result = driver.execute_script("""
                // AWS Console 使用 awsui 组件，查找包含特定文本的 radio
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < allElements.length; i++) {
                    var el = allElements[i];
                    var text = el.innerText || el.textContent || '';
                    // 查找包含 "Generate a one-time password" 的元素
                    if (text.includes('Generate a one-time password') && !text.includes('Send an email')) {
                        // 在这个元素内部或附近查找 radio/input
                        var radio = el.querySelector('input[type="radio"]');
                        if (!radio) {
                            // 向上查找父元素中的 radio
                            var parent = el;
                            for (var j = 0; j < 5; j++) {
                                if (parent) {
                                    radio = parent.querySelector('input[type="radio"]');
                                    if (radio) break;
                                    parent = parent.parentElement;
                                }
                            }
                        }
                        if (radio) {
                            radio.click();
                            return 'clicked radio input';
                        }
                        // 如果没找到 radio，尝试点击元素本身
                        el.click();
                        return 'clicked element: ' + el.tagName;
                    }
                }
                return 'not found by text';
            """)
            log(f"方法1结果: {result}")
            if 'clicked' in result:
                otp_clicked = True
        except Exception as e:
            log(f"方法1失败: {e}")

        # 方法2: 通过 label 文本查找关联的 radio
        if not otp_clicked:
            try:
                result = driver.execute_script("""
                    var labels = document.querySelectorAll('label, span, div');
                    for (var i = 0; i < labels.length; i++) {
                        var text = labels[i].innerText || '';
                        if (text.trim().startsWith('Generate a one-time password')) {
                            // 点击 label 本身
                            labels[i].click();
                            return 'clicked label';
                        }
                    }
                    return 'not found';
                """)
                log(f"方法2结果: {result}")
                if 'clicked' in result:
                    otp_clicked = True
            except Exception as e:
                log(f"方法2失败: {e}")

        # 方法3: 查找所有 radio 并根据位置/顺序选择第一个（通常是 OTP 选项）
        if not otp_clicked:
            try:
                radios = driver.find_elements(By.CSS_SELECTOR, "input[type='radio']")
                log(f"[DEBUG] 找到 {len(radios)} 个 radio 按钮")
                for idx, radio in enumerate(radios):
                    try:
                        # 获取 radio 周围的文本
                        parent = driver.execute_script("return arguments[0].closest('div[class*=\"radio\"], label, div');", radio)
                        if parent:
                            parent_text = parent.text or ""
                            log(f"  Radio {idx}: {parent_text[:80]}")
                            if "generate" in parent_text.lower() and "one-time" in parent_text.lower():
                                driver.execute_script("arguments[0].click();", radio)
                                log(f"方法3: 点击了 radio {idx}")
                                otp_clicked = True
                                break
                    except:
                        continue
            except Exception as e:
                log(f"方法3失败: {e}")

        # 方法4: 直接点击第一个 radio（假设 OTP 是第一个选项）
        if not otp_clicked:
            try:
                result = driver.execute_script("""
                    var radios = document.querySelectorAll('input[type="radio"]');
                    if (radios.length > 0) {
                        radios[0].click();
                        return 'clicked first radio';
                    }
                    return 'no radios found';
                """)
                log(f"方法4结果: {result}")
                if 'clicked' in result:
                    otp_clicked = True
            except Exception as e:
                log(f"方法4失败: {e}")

        if otp_clicked:
            log("[OK] 已选择 'Generate a one-time password' 选项")
        else:
            log("[WARN] 未能点击 OTP 选项，继续尝试填写表单...")

        random_sleep(2, 3)

        log("填写用户信息...")

        # 打印所有输入框用于调试
        inputs = driver.find_elements(By.TAG_NAME, "input")
        log(f"[DEBUG] 找到 {len(inputs)} 个输入框")

        # AWS Console 的输入框可能在 awsui 组件内，使用更通用的方式查找
        # 按顺序填写表单中的输入框（只选择 text 和 email 类型）
        visible_inputs = [inp for inp in inputs if inp.is_displayed() and inp.get_attribute("type") in ["text", "email"]]
        log(f"[DEBUG] 可见文本输入框数量: {len(visible_inputs)}")

        # 过滤掉 search 输入框
        form_inputs = [inp for inp in visible_inputs if inp.get_attribute("placeholder") != "Search" and "search" not in (inp.get_attribute("id") or "").lower()]
        log(f"[DEBUG] 表单输入框数量: {len(form_inputs)}")

        # 打印每个表单输入框的 placeholder
        for i, inp in enumerate(form_inputs):
            placeholder = inp.get_attribute("placeholder") or "(无)"
            log(f"  表单输入框{i}: placeholder={placeholder}")

        # AWS IAM Identity Center 表单字段顺序:
        # 0: Username (Enter username)
        # 1: Email (Enter email address) - 可能没有
        # 2: Confirm email - 可能没有
        # 3: First name (Enter first name)
        # 4: Last name (Enter last name)
        # 5: Display name (Enter display name)

        # 根据 placeholder 智能填写
        filled_count = 0
        for i, inp in enumerate(form_inputs):
            placeholder = (inp.get_attribute("placeholder") or "").lower()

            try:
                if "username" in placeholder:
                    log("填写用户名...")
                    inp.clear()
                    human_type(inp, email)
                    random_sleep(0.3, 0.5)
                    filled_count += 1
                elif "first" in placeholder:
                    log("填写名...")
                    inp.clear()
                    human_type(inp, given_name)
                    random_sleep(0.3, 0.5)
                    filled_count += 1
                elif "last" in placeholder:
                    log("填写姓...")
                    inp.clear()
                    human_type(inp, family_name)
                    random_sleep(0.3, 0.5)
                    filled_count += 1
                elif "display" in placeholder:
                    log("填写显示名称...")
                    inp.clear()
                    human_type(inp, f"{given_name} {family_name}")
                    random_sleep(0.3, 0.5)
                    filled_count += 1
                elif "@example.com" in placeholder or "email" in placeholder:
                    # 邮箱字段 - 可能有两个（邮箱和确认邮箱）
                    log(f"填写邮箱字段 {i}...")
                    inp.clear()
                    human_type(inp, email)
                    random_sleep(0.3, 0.5)
                    filled_count += 1
            except Exception as e:
                log(f"[WARN] 填写字段失败: {e}")

        log(f"已填写 {filled_count} 个字段")

        random_sleep(1, 2)

        # 滚动页面到底部
        log("滚动页面到底部...")
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            random_sleep(1, 2)
            # 也尝试滚动表单容器
            driver.execute_script("""
                var containers = document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="drawer"], [class*="panel"], [role="dialog"]');
                for (var i = 0; i < containers.length; i++) {
                    containers[i].scrollTop = containers[i].scrollHeight;
                }
            """)
            random_sleep(1, 2)
        except Exception as e:
            log(f"滚动失败: {e}")

        # 点击 Next 按钮 - 使用多种方法
        log("查找并点击 Next 按钮...")
        next_clicked = False

        # 方法1: 查找 awsui 按钮组件并滚动到可见
        try:
            result = driver.execute_script("""
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var btn = buttons[i];
                    var text = btn.innerText || btn.textContent || '';
                    if (text.trim() === 'Next' && !btn.disabled) {
                        btn.scrollIntoView({behavior: 'smooth', block: 'center'});
                        return 'found';
                    }
                }
                return 'not found';
            """)
            log(f"查找 Next 按钮: {result}")

            if result == 'found':
                random_sleep(0.5, 1)
                # 使用 Selenium 点击
                buttons = driver.find_elements(By.TAG_NAME, "button")
                for btn in buttons:
                    try:
                        if btn.text.strip() == 'Next' and btn.is_enabled():
                            log("使用 Selenium 点击 Next...")
                            driver.execute_script("arguments[0].click();", btn)
                            next_clicked = True
                            break
                    except:
                        continue
        except Exception as e:
            log(f"方法1失败: {e}")

        # 方法2: 使用 JavaScript 强制点击
        if not next_clicked:
            try:
                result = driver.execute_script("""
                    var buttons = document.querySelectorAll('button');
                    for (var i = 0; i < buttons.length; i++) {
                        var text = buttons[i].innerText || buttons[i].textContent || '';
                        if (text.trim() === 'Next') {
                            buttons[i].focus();
                            buttons[i].click();
                            var evt = new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            buttons[i].dispatchEvent(evt);
                            return 'clicked: ' + buttons[i].className;
                        }
                    }
                    return 'not found';
                """)
                log(f"方法2 JS点击结果: {result}")
                if 'clicked' in result:
                    next_clicked = True
            except Exception as e:
                log(f"方法2失败: {e}")

        # 方法3: 查找 span 内的 Next 文本并点击父级按钮
        if not next_clicked:
            try:
                result = driver.execute_script("""
                    var spans = document.querySelectorAll('span');
                    for (var i = 0; i < spans.length; i++) {
                        var text = spans[i].innerText || spans[i].textContent || '';
                        if (text.trim() === 'Next') {
                            var parent = spans[i].parentElement;
                            for (var j = 0; j < 5; j++) {
                                if (parent && parent.tagName === 'BUTTON') {
                                    parent.click();
                                    return 'clicked parent button';
                                }
                                parent = parent ? parent.parentElement : null;
                            }
                            spans[i].click();
                            return 'clicked span';
                        }
                    }
                    return 'not found';
                """)
                log(f"方法3结果: {result}")
                if 'clicked' in result:
                    next_clicked = True
            except Exception as e:
                log(f"方法3失败: {e}")

        if next_clicked:
            log("[OK] Next 按钮已点击")
        else:
            log("[WARN] 未能点击 Next 按钮，尝试截图...")
            driver.save_screenshot(f"debug_next_btn_{int(time.time())}.png")

        random_sleep(3, 5)

        # 第二步：选择群组 - 选中 devloper 群组
        log("第二步：选择 devloper 群组...")
        random_sleep(2, 3)  # 等待页面加载

        group_selected = False

        # 方法1: 使用 Selenium 查找 devloper 行并点击 checkbox
        try:
            # 先找到包含 "devloper" 文本的元素
            elements = driver.find_elements(By.XPATH, "//*[contains(text(), 'devloper') or contains(text(), 'Devloper')]")
            log(f"[DEBUG] 找到 {len(elements)} 个包含 devloper 的元素")

            for el in elements:
                try:
                    el_text = el.text.strip().lower()
                    # 只处理文本就是 devloper 的元素
                    if el_text == 'devloper' or 'devloper' in el_text and len(el_text) < 30:
                        # 获取该元素所在的行
                        row = driver.execute_script("""
                            var el = arguments[0];
                            for (var i = 0; i < 10; i++) {
                                if (!el) return null;
                                if (el.tagName === 'TR' || el.getAttribute('role') === 'row') {
                                    return el;
                                }
                                el = el.parentElement;
                            }
                            return null;
                        """, el)

                        if row:
                            # 在该行中查找 checkbox
                            checkboxes = row.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
                            if checkboxes:
                                driver.execute_script("arguments[0].click();", checkboxes[0])
                                log("[OK] 方法1: 点击了 devloper 行的 checkbox")
                                group_selected = True
                                break
                            # 尝试点击 label
                            labels = row.find_elements(By.TAG_NAME, "label")
                            if labels:
                                driver.execute_script("arguments[0].click();", labels[0])
                                log("[OK] 方法1: 点击了 devloper 行的 label")
                                group_selected = True
                                break
                except Exception as inner_e:
                    log(f"[DEBUG] 处理元素时出错: {inner_e}")
                    continue
        except Exception as e:
            log(f"方法1失败: {e}")

        # 方法2: 通过 awsui 表格组件查找
        if not group_selected:
            try:
                result = driver.execute_script("""
                    // AWS Console 使用 awsui 表格，查找 td 或 cell 中包含 devloper 的
                    var cells = document.querySelectorAll('td, [role="cell"], [role="gridcell"]');
                    for (var i = 0; i < cells.length; i++) {
                        var text = cells[i].innerText || cells[i].textContent || '';
                        if (text.toLowerCase().includes('devloper')) {
                            // 找到同一行的 checkbox
                            var row = cells[i].closest('tr, [role="row"]');
                            if (row) {
                                var checkbox = row.querySelector('input[type="checkbox"]');
                                if (checkbox) {
                                    checkbox.click();
                                    return 'clicked checkbox in same row as devloper cell';
                                }
                                var label = row.querySelector('label');
                                if (label) {
                                    label.click();
                                    return 'clicked label in same row as devloper cell';
                                }
                            }
                        }
                    }
                    return 'not found in cells';
                """)
                log(f"方法2选择群组: {result}")
                if 'clicked' in result:
                    group_selected = True
            except Exception as e:
                log(f"方法2失败: {e}")

        # 方法3: 直接查找所有 checkbox 并检查周围文本
        if not group_selected:
            try:
                result = driver.execute_script("""
                    var checkboxes = document.querySelectorAll('input[type="checkbox"]');
                    for (var i = 0; i < checkboxes.length; i++) {
                        // 向上查找5层父元素
                        var parent = checkboxes[i];
                        for (var j = 0; j < 5; j++) {
                            parent = parent.parentElement;
                            if (!parent) break;
                            var text = parent.innerText || parent.textContent || '';
                            if (text.toLowerCase().includes('devloper') && text.length < 200) {
                                checkboxes[i].click();
                                return 'clicked checkbox near devloper text (method 3)';
                            }
                        }
                    }
                    return 'not found by checkbox search';
                """)
                log(f"方法3选择群组: {result}")
                if 'clicked' in result:
                    group_selected = True
            except Exception as e:
                log(f"方法3失败: {e}")

        # 方法4: 使用 Selenium 查找
        if not group_selected:
            try:
                checkboxes = driver.find_elements(By.CSS_SELECTOR, "input[type='checkbox']")
                log(f"[DEBUG] 找到 {len(checkboxes)} 个 checkbox")
                for cb in checkboxes:
                    try:
                        # 获取 checkbox 所在行的文本
                        row = driver.execute_script("return arguments[0].closest('tr, [role=\"row\"]');", cb)
                        if row:
                            row_text = row.text.lower()
                            if 'devloper' in row_text:
                                driver.execute_script("arguments[0].click();", cb)
                                log("方法4: 使用 Selenium 点击了 devloper checkbox")
                                group_selected = True
                                break
                    except:
                        continue
            except Exception as e:
                log(f"方法4失败: {e}")

        # 方法5: 专门针对 AWS Console awsui 表格的 checkbox
        if not group_selected:
            try:
                result = driver.execute_script("""
                    // AWS Console 表格中，checkbox 通常在 td 的第一列
                    // 找到包含 devloper 的行，然后点击该行第一个 td 中的任何可点击元素
                    var trs = document.querySelectorAll('tr');
                    for (var i = 0; i < trs.length; i++) {
                        var rowText = trs[i].innerText || '';
                        if (rowText.toLowerCase().includes('devloper')) {
                            // 获取第一个 td
                            var firstTd = trs[i].querySelector('td');
                            if (firstTd) {
                                // 点击 td 内的第一个可点击元素
                                var clickable = firstTd.querySelector('input, label, button, span, div');
                                if (clickable) {
                                    clickable.click();
                                    return 'clicked first clickable in devloper row td';
                                }
                                // 直接点击 td
                                firstTd.click();
                                return 'clicked devloper row first td';
                            }
                            // 直接点击整行
                            trs[i].click();
                            return 'clicked devloper row';
                        }
                    }
                    return 'devloper row not found';
                """)
                log(f"方法5选择群组: {result}")
                if 'clicked' in result:
                    group_selected = True
            except Exception as e:
                log(f"方法5失败: {e}")

        # 方法6: 使用 Selenium 查找所有 label 并点击包含 developer 的
        if not group_selected:
            try:
                labels = driver.find_elements(By.TAG_NAME, "label")
                log(f"[DEBUG] 找到 {len(labels)} 个 label")
                for label in labels:
                    try:
                        # 获取 label 所在行的文本
                        parent = driver.execute_script("""
                            var el = arguments[0];
                            for (var i = 0; i < 8; i++) {
                                el = el.parentElement;
                                if (!el) return null;
                                var text = el.innerText || '';
                                if (text.toLowerCase().includes('devloper') && text.length < 200) {
                                    return el;
                                }
                            }
                            return null;
                        """, label)
                        if parent:
                            driver.execute_script("arguments[0].click();", label)
                            log("方法6: 点击了 devloper 行的 label")
                            group_selected = True
                            break
                    except:
                        continue
            except Exception as e:
                log(f"方法6失败: {e}")

        if group_selected:
            log("[OK] 已选择 devloper 群组")
        else:
            log("[WARN] 未能选择 devloper 群组")
            driver.save_screenshot(f"debug_group_{int(time.time())}.png")

        random_sleep(1, 2)

        # 点击 Next 进入确认页
        log("点击 Next 进入确认页...")
        try:
            result = driver.execute_script("""
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var text = buttons[i].innerText || buttons[i].textContent || '';
                    if (text.trim() === 'Next' && !buttons[i].disabled) {
                        buttons[i].scrollIntoView({behavior: 'smooth', block: 'center'});
                        buttons[i].click();
                        return 'clicked Next (step 2)';
                    }
                }
                return 'no Next button found';
            """)
            log(f"第二步 Next: {result}")
            random_sleep(3, 5)
        except Exception as e:
            log(f"第二步处理: {e}")

        # 最终确认 - Add user
        log("查找 Add user 确认按钮...")
        try:
            result = driver.execute_script("""
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var text = buttons[i].innerText || buttons[i].textContent || '';
                    if (text.trim() === 'Add user' && !buttons[i].disabled) {
                        buttons[i].scrollIntoView({behavior: 'smooth', block: 'center'});
                        buttons[i].click();
                        return 'clicked Add user';
                    }
                }
                return 'Add user button not found';
            """)
            log(f"Add user 按钮: {result}")
            random_sleep(3, 5)
        except Exception as e:
            log(f"Add user 处理: {e}")

        # 等待成功弹窗出现，提取所有字段
        log("等待成功弹窗...")
        random_sleep(3, 4)

        # 提取弹窗中的所有字段
        log("提取弹窗中的所有字段...")
        try:
            popup_data = driver.execute_script("""
                var result = {};

                // 密码验证函数
                function isValidPassword(text) {
                    if (!text || text.length < 8 || text.length > 60) return false;
                    if (text.includes('@')) return false;
                    if (/\\s/.test(text)) return false;
                    var regionPatterns = ['us-east', 'us-west', 'eu-west', 'eu-central', 'eu-north', 'eu-south',
                        'ap-south', 'ap-northeast', 'ap-southeast', 'ap-east', 'ca-central', 'sa-east',
                        'me-south', 'me-central', 'af-south', 'il-central',
                        'Canada', 'Ohio', 'Virginia', 'Oregon', 'California', 'Ireland', 'London', 'Paris',
                        'Frankfurt', 'Stockholm', 'Milan', 'Mumbai', 'Singapore', 'Sydney', 'Tokyo', 'Seoul', 'Central'];
                    for (var i = 0; i < regionPatterns.length; i++) {
                        if (text.includes(regionPatterns[i])) return false;
                    }
                    if (text.includes('awsapps.com')) return false;
                    if (text.includes('portal.')) return false;
                    if (text.includes('http')) return false;
                    if (!/[A-Z]/.test(text)) return false;
                    if (!/[a-z]/.test(text)) return false;
                    if (!/[0-9]/.test(text)) return false;
                    if (!/[!@#$%^&*()_+=\\[\\]{}|;:,.<>?~\\-/<>]/.test(text)) return false;
                    return true;
                }

                // 标签名映射 - 注意: Password 和 One-time password 是不同的字段
                var labelMap = {
                    'Username': 'Username', 'User name': 'Username',
                    'Email': 'Email', 'Email address': 'Email',
                    'First name': 'First_name', 'Last name': 'Last_name',
                    'Display name': 'Display_name',
                    'Password': 'Password',
                    'One-time password': 'One-time_password',
                    'Portal URL': 'Portal_URL', 'AWS access portal URL': 'Portal_URL',
                    'User ID': 'User_ID', 'Status': 'Status', 'Group': 'Groups', 'Groups': 'Groups'
                };

                // 查找弹窗/对话框
                var dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="flash"], [class*="alert"], [class*="awsui-flash"], [class*="awsui-modal"], [class*="awsui-alert"], [class*="awsui-container"]');
                var dialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document.body;

                // 方法1: 查找 key-value 对
                var allElements = dialog.querySelectorAll('div, span, p, dt, dd, tr, td, th, label, h3, h4');
                for (var i = 0; i < allElements.length; i++) {
                    var el = allElements[i];
                    var text = (el.innerText || el.textContent || '').trim();
                    for (var labelText in labelMap) {
                        if (text === labelText || text === labelText + ':') {
                            var fieldKey = labelMap[labelText];
                            if (result[fieldKey]) continue;
                            var value = null;
                            var nextEl = el.nextElementSibling;
                            if (nextEl) value = (nextEl.innerText || nextEl.value || '').trim();
                            if (!value || value.length > 200) {
                                var parent = el.parentElement;
                                if (parent && parent.nextElementSibling) {
                                    value = (parent.nextElementSibling.innerText || '').trim();
                                }
                            }
                            if (!value || value.length > 200) {
                                var parent = el.parentElement;
                                if (parent) {
                                    for (var c = 0; c < parent.children.length; c++) {
                                        if (parent.children[c] !== el) {
                                            var childText = (parent.children[c].innerText || '').trim();
                                            if (childText && childText !== text && childText.length < 200) {
                                                value = childText; break;
                                            }
                                        }
                                    }
                                }
                            }
                            if (value && value.length < 200 && value !== text) result[fieldKey] = value;
                        }
                    }
                }

                // 方法2: 查找 awsui key-value 组件
                var kvPairs = dialog.querySelectorAll('[class*="key-value"], [class*="awsui-key-value"], [class*="form-field"]');
                for (var i = 0; i < kvPairs.length; i++) {
                    var keyEl = kvPairs[i].querySelector('[class*="key"], [class*="label"], dt, th, label');
                    var valueEl = kvPairs[i].querySelector('[class*="value"], [class*="content"], dd, td, input');
                    if (keyEl && valueEl) {
                        var keyText = (keyEl.innerText || '').trim().replace(/:/g, '');
                        var value = (valueEl.value || valueEl.innerText || '').trim();
                        if (keyText && value && value.length < 200) {
                            var fieldKey = labelMap[keyText] || keyText.replace(/\\s+/g, '_');
                            if (!result[fieldKey]) result[fieldKey] = value;
                        }
                    }
                }

                // 方法3: 查找所有 input 字段及其 label
                var inputs = dialog.querySelectorAll('input');
                for (var i = 0; i < inputs.length; i++) {
                    var input = inputs[i];
                    var value = input.value || '';
                    if (!value || value.length > 200) continue;

                    // 查找关联的 label
                    var labelEl = null;
                    if (input.id) {
                        labelEl = document.querySelector('label[for="' + input.id + '"]');
                    }
                    if (!labelEl) {
                        labelEl = input.closest('label');
                    }
                    if (!labelEl) {
                        // 向上查找最近的包含文本的元素
                        var parent = input.parentElement;
                        for (var j = 0; j < 5; j++) {
                            if (!parent) break;
                            var prevSibling = parent.previousElementSibling;
                            if (prevSibling) {
                                var sibText = (prevSibling.innerText || '').trim();
                                if (sibText && sibText.length < 50) {
                                    labelEl = prevSibling;
                                    break;
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }

                    var key = labelEl ? (labelEl.innerText || '').trim().replace(/:/g, '').replace(/\\s+/g, '_') : 'Field_' + i;
                    if (key && value) {
                        result[key] = value;
                    }
                }

                // 方法4: 查找 Portal URL
                var links = dialog.querySelectorAll('a[href*="awsapps.com"], a[href*="signin"]');
                for (var i = 0; i < links.length; i++) {
                    var href = links[i].href || links[i].getAttribute('href');
                    if (href) {
                        result['Portal_URL'] = href;
                        break;
                    }
                }

                // 方法5: 专门查找 "One-time password" 字段
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < allElements.length; i++) {
                    var el = allElements[i];
                    var text = (el.innerText || el.textContent || '').trim();
                    // 精确匹配 "One-time password" 标签
                    if (text === 'One-time password' || text === 'One-time password:') {
                        // 查找该标签后面的 input 或文本值
                        // 方法5a: 查找同级或子级的 input
                        var parent = el.parentElement;
                        for (var p = 0; p < 5 && parent; p++) {
                            var inputs = parent.querySelectorAll('input');
                            for (var j = 0; j < inputs.length; j++) {
                                var val = inputs[j].value || '';
                                if (val && val.length >= 8 && val.length <= 60 && !val.includes('@')) {
                                    result['One-time_password'] = val;
                                    break;
                                }
                            }
                            if (result['One-time_password']) break;
                            parent = parent.parentElement;
                        }
                        // 方法5b: 查找下一个兄弟元素中的文本
                        if (!result['One-time_password']) {
                            var next = el.nextElementSibling;
                            while (next) {
                                var nextText = (next.value || next.innerText || '').trim();
                                if (nextText && nextText.length >= 8 && nextText.length <= 60 && !nextText.includes('@') && !nextText.includes(' ')) {
                                    result['One-time_password'] = nextText;
                                    break;
                                }
                                var nextInput = next.querySelector('input');
                                if (nextInput && nextInput.value) {
                                    result['One-time_password'] = nextInput.value;
                                    break;
                                }
                                next = next.nextElementSibling;
                            }
                        }
                        if (result['One-time_password']) break;
                    }
                }

                // 方法6: 备用 - 遍历所有文本查找符合密码格式的
                if (!result['One-time_password']) {
                    var allText = dialog.querySelectorAll('span, div, p, code, pre, input');
                    for (var i = 0; i < allText.length; i++) {
                        var text = (allText[i].value || allText[i].innerText || allText[i].textContent || '').trim();
                        if (isValidPassword(text)) {
                            result['One-time_password'] = text;
                            break;
                        }
                    }
                }

                return result;
            """)
            log(f"[DEBUG] 提取到的弹窗字段: {popup_data}")
        except Exception as e:
            log(f"提取弹窗字段失败: {e}")

        # 处理可能出现的权限弹窗（点击"允许"）
        try:
            driver.execute_script("""
                // 查找并点击"允许"按钮
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var text = buttons[i].innerText || '';
                    if (text.trim() === '允许' || text.trim() === 'Allow') {
                        buttons[i].click();
                        break;
                    }
                }
            """)
        except:
            pass

        # 先打印弹窗中的所有数据用于调试
        log("========== 弹窗原始数据(点击Show前) ==========")
        try:
            all_popup_text = driver.execute_script("""
                var result = [];
                var dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="flash"], [class*="alert"], [class*="awsui-flash"], [class*="awsui-modal"]');
                var dialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
                if (dialog) {
                    var elements = dialog.querySelectorAll('div, span, p, label, input, a, code, pre');
                    for (var i = 0; i < elements.length; i++) {
                        var el = elements[i];
                        var text = (el.value || el.innerText || el.textContent || '').trim();
                        if (text && text.length > 0 && text.length < 200) {
                            var isDuplicate = false;
                            for (var j = 0; j < result.length; j++) {
                                if (result[j] === text) { isDuplicate = true; break; }
                            }
                            if (!isDuplicate) result.push(text);
                        }
                    }
                }
                return result;
            """)
            for item in all_popup_text:
                log(f"  > {item[:80]}")
            log("==============================================")
        except Exception as e:
            log(f"获取弹窗数据失败: {e}")

        # 先点击 "Show password" 前面的 checkbox 来显示密码
        log("点击 Show password 的 checkbox...")
        try:
            result = driver.execute_script("""
                // 方法1: 查找包含 "Show password" 文本的元素，然后点击其附近的 checkbox
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < allElements.length; i++) {
                    var text = allElements[i].innerText || allElements[i].textContent || '';
                    if (text.trim() === 'Show password' || text.trim() === 'Show') {
                        // 向上查找父元素中的 checkbox
                        var parent = allElements[i];
                        for (var j = 0; j < 5; j++) {
                            if (!parent) break;
                            var checkbox = parent.querySelector('input[type="checkbox"]');
                            if (checkbox) {
                                checkbox.click();
                                return 'clicked checkbox near Show password';
                            }
                            parent = parent.parentElement;
                        }
                        // 如果没找到 checkbox，尝试点击 label 本身
                        var label = allElements[i].closest('label');
                        if (label) {
                            label.click();
                            return 'clicked label containing Show password';
                        }
                    }
                }

                // 方法2: 查找所有 checkbox，找到旁边有 "Show" 文本的
                var checkboxes = document.querySelectorAll('input[type="checkbox"]');
                for (var i = 0; i < checkboxes.length; i++) {
                    var parent = checkboxes[i].parentElement;
                    for (var j = 0; j < 3; j++) {
                        if (!parent) break;
                        var text = parent.innerText || '';
                        if (text.toLowerCase().includes('show password') ||
                            (text.toLowerCase().includes('show') && text.length < 30)) {
                            checkboxes[i].click();
                            return 'clicked checkbox with Show text nearby';
                        }
                        parent = parent.parentElement;
                    }
                }

                // 方法3: 查找 awsui checkbox 组件的 label
                var labels = document.querySelectorAll('label');
                for (var i = 0; i < labels.length; i++) {
                    var text = labels[i].innerText || '';
                    if (text.toLowerCase().includes('show password') || text.trim().toLowerCase() === 'show') {
                        labels[i].click();
                        return 'clicked label with Show password text';
                    }
                }

                return 'Show password checkbox not found';
            """)
            log(f"显示密码: {result}")
        except Exception as e:
            log(f"点击显示密码失败: {e}")

        # 等待密码显示
        log("等待密码显示...")
        random_sleep(3, 5)

        # 打印点击 Show password 后的弹窗数据
        log("========== 弹窗数据(点击Show后) ==========")
        try:
            all_popup_text = driver.execute_script("""
                var result = [];
                var dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="flash"], [class*="alert"], [class*="awsui-flash"], [class*="awsui-modal"]');
                var dialog = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
                if (dialog) {
                    var elements = dialog.querySelectorAll('div, span, p, label, input, a, code, pre');
                    for (var i = 0; i < elements.length; i++) {
                        var el = elements[i];
                        var text = (el.value || el.innerText || el.textContent || '').trim();
                        if (text && text.length > 0 && text.length < 200) {
                            var isDuplicate = false;
                            for (var j = 0; j < result.length; j++) {
                                if (result[j] === text) { isDuplicate = true; break; }
                            }
                            if (!isDuplicate) result.push(text);
                        }
                    }
                }
                return result;
            """)
            for item in all_popup_text:
                log(f"  > {item[:80]}")
            log("==========================================")
        except Exception as e:
            log(f"获取弹窗数据失败: {e}")

        # 专门打印所有 input 的值
        log("========== 所有 INPUT 字段 ==========")
        try:
            input_values = driver.execute_script("""
                var result = [];
                var inputs = document.querySelectorAll('input');
                for (var i = 0; i < inputs.length; i++) {
                    var inp = inputs[i];
                    var val = inp.value || '';
                    var type = inp.type || 'text';
                    var placeholder = inp.placeholder || '';
                    var id = inp.id || '';
                    result.push({
                        index: i,
                        type: type,
                        value: val,
                        placeholder: placeholder,
                        id: id
                    });
                }
                return result;
            """)
            for inp in input_values:
                val_display = inp['value'][:50] if inp['value'] else ''
                log(f"  Input[{inp['index']}]: type={inp['type']}, value='{val_display}', placeholder='{inp['placeholder']}'")
            log("======================================")
        except Exception as e:
            log(f"获取 input 字段失败: {e}")

        # 新方法：专门查找 "One-time password" 标签并获取其值
        log("专门查找 One-time password 字段...")
        try:
            otp_from_label = driver.execute_script("""
                // 查找所有包含 "One-time password" 文本的元素
                var allElements = document.querySelectorAll('*');
                var results = [];

                for (var i = 0; i < allElements.length; i++) {
                    var el = allElements[i];
                    // 只检查直接文本内容，避免获取子元素的文本
                    var directText = '';
                    for (var j = 0; j < el.childNodes.length; j++) {
                        if (el.childNodes[j].nodeType === 3) { // TEXT_NODE
                            directText += el.childNodes[j].textContent;
                        }
                    }
                    directText = directText.trim();

                    // 也检查 innerText
                    var innerText = (el.innerText || '').trim();

                    if (directText === 'One-time password' || innerText === 'One-time password' ||
                        directText === 'One-time password:' || innerText === 'One-time password:') {

                        // 找到标签了，现在查找值
                        // 方法1: 查找同一父元素下的其他子元素
                        var parent = el.parentElement;
                        if (parent) {
                            var siblings = parent.children;
                            for (var k = 0; k < siblings.length; k++) {
                                if (siblings[k] !== el) {
                                    var sibText = (siblings[k].value || siblings[k].innerText || '').trim();
                                    if (sibText && sibText.length >= 8 && sibText.length <= 80 &&
                                        !sibText.includes('One-time') && !sibText.includes('password')) {
                                        results.push('sibling: ' + sibText);
                                    }
                                    // 检查 input
                                    var inp = siblings[k].querySelector('input');
                                    if (inp && inp.value) {
                                        results.push('sibling-input: ' + inp.value);
                                    }
                                }
                            }
                        }

                        // 方法2: 查找下一个兄弟元素
                        var next = el.nextElementSibling;
                        if (next) {
                            var nextText = (next.value || next.innerText || '').trim();
                            if (nextText && nextText.length >= 8) {
                                results.push('next: ' + nextText);
                            }
                            var nextInp = next.querySelector('input');
                            if (nextInp && nextInp.value) {
                                results.push('next-input: ' + nextInp.value);
                            }
                        }

                        // 方法3: 向上查找父元素，然后查找其中的 input
                        for (var p = 0; p < 5 && parent; p++) {
                            var inputs = parent.querySelectorAll('input');
                            for (var m = 0; m < inputs.length; m++) {
                                if (inputs[m].value && inputs[m].value.length >= 8) {
                                    results.push('parent-input[' + p + ']: ' + inputs[m].value);
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                }
                return results;
            """)
            log(f"[DEBUG] One-time password 查找结果: {otp_from_label}")

            # 从结果中提取密码
            for item in otp_from_label:
                if ':' in item:
                    pwd_candidate = item.split(':', 1)[1].strip()
                    # 清理掉 "Hide password" 和换行符
                    if '\n' in pwd_candidate:
                        pwd_candidate = pwd_candidate.split('\n')[0].strip()
                    pwd_candidate = pwd_candidate.replace('Hide password', '').strip()
                    # 排除包含特定文本的候选项
                    if 'User password was reset' in pwd_candidate:
                        continue
                    if 'awsapps.com' in pwd_candidate:
                        continue
                    if pwd_candidate.startswith('http'):
                        continue
                    if ' ' in pwd_candidate:  # 密码不应包含空格
                        continue
                    if pwd_candidate == 'on':  # 排除 checkbox 的值
                        continue
                    # 排除邮箱格式（xxx@xxx.xxx）
                    import re
                    if re.match(r'^[^@]+@[^@]+\.[^@]+$', pwd_candidate):
                        continue
                    if pwd_candidate and len(pwd_candidate) >= 8 and len(pwd_candidate) <= 80:
                        otp_password = pwd_candidate
                        log(f"[OK] 从 One-time password 标签获取到密码: {otp_password}")
                        break
        except Exception as e:
            log(f"查找 One-time password 失败: {e}")

        # 首先尝试直接从页面读取密码（避免剪贴板权限问题）
        log("尝试直接从页面读取密码...")
        try:
            password_text = driver.execute_script("""
                // AWS IAM Identity Center 密码验证函数
                function isValidPassword(text) {
                    if (!text || text.length < 8 || text.length > 60) return false;
                    if (text.includes('@')) return false;  // 排除邮箱
                    if (/\\s/.test(text)) return false;    // 排除含空格的
                    // 排除包含 AWS 区域名的文本 (更全面)
                    var regionPatterns = ['us-east', 'us-west', 'eu-west', 'eu-central', 'eu-north', 'eu-south',
                        'ap-south', 'ap-northeast', 'ap-southeast', 'ap-east', 'ca-central', 'sa-east',
                        'me-south', 'me-central', 'af-south', 'il-central',
                        'Canada', 'Ohio', 'Virginia', 'Oregon', 'California', 'Ireland', 'London', 'Paris',
                        'Frankfurt', 'Stockholm', 'Milan', 'Mumbai', 'Singapore', 'Sydney', 'Tokyo', 'Seoul'];
                    for (var i = 0; i < regionPatterns.length; i++) {
                        if (text.includes(regionPatterns[i])) return false;
                    }
                    if (text.includes('awsapps.com')) return false;  // 排除 URL
                    if (text.includes('portal.')) return false;  // 排除 URL
                    if (text.includes('http')) return false;  // 排除 URL
                    if (text.includes('Central')) return false;  // 排除区域名
                    if (!/[A-Z]/.test(text)) return false; // 必须包含大写字母
                    if (!/[a-z]/.test(text)) return false; // 必须包含小写字母
                    if (!/[0-9]/.test(text)) return false; // 必须包含数字
                    if (!/[!@#$%^&*()_+=\\[\\]{}|;:,.<>?~\\-/<>]/.test(text)) return false; // 必须包含特殊字符
                    return true;
                }

                // 方法1: 查找 awsui-input 组件中的密码值
                var inputs = document.querySelectorAll('input');
                for (var i = 0; i < inputs.length; i++) {
                    var val = inputs[i].value || '';
                    if (isValidPassword(val)) {
                        return val;
                    }
                }

                // 方法2: 查找弹窗/对话框中的密码文本
                var dialogs = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="flash"], [class*="alert"], [class*="awsui-flash"], [class*="awsui-modal"]');
                for (var d = 0; d < dialogs.length; d++) {
                    var allText = dialogs[d].querySelectorAll('span, div, p, code, pre, input');
                    for (var i = 0; i < allText.length; i++) {
                        var text = allText[i].value || allText[i].innerText || allText[i].textContent || '';
                        text = text.trim();
                        if (isValidPassword(text)) {
                            return text;
                        }
                    }
                }

                // 方法3: 查找 password 相关容器
                var pwdContainers = document.querySelectorAll('[class*="password"], [class*="Password"], [class*="otp"], [class*="one-time"], [class*="credential"]');
                for (var i = 0; i < pwdContainers.length; i++) {
                    var inputs = pwdContainers[i].querySelectorAll('input');
                    for (var j = 0; j < inputs.length; j++) {
                        var val = inputs[j].value || '';
                        if (isValidPassword(val)) {
                            return val;
                        }
                    }
                    // 也检查文本内容
                    var spans = pwdContainers[i].querySelectorAll('span, div, code');
                    for (var j = 0; j < spans.length; j++) {
                        var text = spans[j].innerText || '';
                        text = text.trim();
                        if (isValidPassword(text)) {
                            return text;
                        }
                    }
                }

                return null;
            """)

            if password_text:
                otp_password = password_text
                log(f"[OK] 直接从页面读取到密码: {otp_password}")
        except Exception as e:
            log(f"直接读取密码失败: {e}")

        # 等待密码显示出来
        random_sleep(2, 3)

        # 如果还没获取到密码，尝试再次点击 Show password checkbox 后再获取
        if not otp_password:
            log("尝试再次点击 Show password checkbox...")
            try:
                driver.execute_script("""
                    // 查找 Show password 的 checkbox 并点击
                    var labels = document.querySelectorAll('label');
                    for (var i = 0; i < labels.length; i++) {
                        var text = labels[i].innerText || '';
                        if (text.toLowerCase().includes('show password') || text.trim().toLowerCase() === 'show') {
                            labels[i].click();
                            break;
                        }
                    }
                    // 也尝试查找 checkbox
                    var checkboxes = document.querySelectorAll('input[type="checkbox"]');
                    for (var i = 0; i < checkboxes.length; i++) {
                        var parent = checkboxes[i].parentElement;
                        if (parent) {
                            var text = parent.innerText || '';
                            if (text.toLowerCase().includes('show')) {
                                if (!checkboxes[i].checked) {
                                    checkboxes[i].click();
                                }
                                break;
                            }
                        }
                    }
                """)
                random_sleep(1, 2)

                # 尝试直接从页面读取密码文本
                log("尝试从页面直接读取密码...")
                password_text = driver.execute_script("""
                    // 密码验证函数
                    function isValidPassword(text) {
                        if (!text || text.length < 8 || text.length > 60) return false;
                        if (text.includes('@')) return false;
                        if (/\\s/.test(text)) return false;
                        var regionPatterns = ['us-east', 'us-west', 'eu-west', 'eu-central', 'eu-north', 'eu-south',
                            'ap-south', 'ap-northeast', 'ap-southeast', 'ap-east', 'ca-central', 'sa-east',
                            'me-south', 'me-central', 'af-south', 'il-central',
                            'Canada', 'Ohio', 'Virginia', 'Oregon', 'California', 'Ireland', 'London', 'Paris',
                            'Frankfurt', 'Stockholm', 'Milan', 'Mumbai', 'Singapore', 'Sydney', 'Tokyo', 'Seoul', 'Central'];
                        for (var i = 0; i < regionPatterns.length; i++) {
                            if (text.includes(regionPatterns[i])) return false;
                        }
                        if (text.includes('awsapps.com')) return false;
                        if (text.includes('portal.')) return false;
                        if (text.includes('http')) return false;
                        if (!/[A-Z]/.test(text)) return false;
                        if (!/[a-z]/.test(text)) return false;
                        if (!/[0-9]/.test(text)) return false;
                        if (!/[!@#$%^&*()_+=\\[\\]{}|;:,.<>?~\\-/<>]/.test(text)) return false;
                        return true;
                    }

                    // 查找显示密码的元素
                    // 方法1: 查找弹窗中的密码文本
                    var modal = document.querySelector('[role="dialog"], [class*="modal"], [class*="flash"], [class*="alert"], [class*="awsui-flash"]');
                    if (modal) {
                        var allText = modal.querySelectorAll('span, div, p, code, pre, input');
                        for (var i = 0; i < allText.length; i++) {
                            var text = allText[i].value || allText[i].innerText || allText[i].textContent || '';
                            text = text.trim();
                            if (isValidPassword(text)) {
                                return text;
                            }
                        }
                    }

                    // 方法2: 查找 password 相关的容器
                    var pwdContainers = document.querySelectorAll('[class*="password"], [class*="Password"], [class*="otp"], [class*="one-time"]');
                    for (var i = 0; i < pwdContainers.length; i++) {
                        var inputs = pwdContainers[i].querySelectorAll('input');
                        for (var j = 0; j < inputs.length; j++) {
                            var val = inputs[j].value || '';
                            if (isValidPassword(val)) {
                                return val;
                            }
                        }
                    }

                    // 方法3: 查找所有 input
                    var inputs = document.querySelectorAll('input');
                    for (var i = 0; i < inputs.length; i++) {
                        var val = inputs[i].value || '';
                        if (isValidPassword(val)) {
                            return val;
                        }
                    }

                    return null;
                """)

                if password_text:
                    otp_password = password_text
                    log(f"[OK] 从页面直接读取到密码: {otp_password}")

                # 如果还没获取到，再次点击 Copy
                if not otp_password:
                    driver.execute_script("""
                        var buttons = document.querySelectorAll('button');
                        for (var i = 0; i < buttons.length; i++) {
                            var text = buttons[i].innerText || '';
                            if (text.trim() === 'Copy') {
                                buttons[i].click();
                                break;
                            }
                        }
                    """)
                    random_sleep(0.5, 1)

                    # 再次从剪贴板读取
                    import subprocess
                    clipboard_content = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout.strip()
                    # 验证是否像密码（8-60字符，包含字母和数字，无空格，非邮箱，非URL）
                    if clipboard_content and len(clipboard_content) >= 8 and len(clipboard_content) <= 60:
                        if '@' not in clipboard_content and ' ' not in clipboard_content:
                            if 'awsapps.com' not in clipboard_content and 'portal.us-east' not in clipboard_content:
                                import re
                                if re.search(r'[A-Za-z]', clipboard_content) and re.search(r'[0-9]', clipboard_content):
                                    otp_password = clipboard_content
                                    log(f"[OK] 第二次从剪贴板获取到密码: {otp_password}")

            except Exception as e:
                log(f"显示密码失败: {e}")

        # 点击 Close 或 Done 按钮关闭弹窗
        log("关闭弹窗...")
        try:
            driver.execute_script("""
                var buttons = document.querySelectorAll('button');
                for (var i = 0; i < buttons.length; i++) {
                    var text = buttons[i].innerText || buttons[i].textContent || '';
                    if (text.trim() === 'Close' || text.trim() === 'Done' || text.trim() === 'OK') {
                        buttons[i].click();
                        return;
                    }
                }
            """)
            random_sleep(1, 2)
        except:
            pass

        # 合并所有提取的数据
        result_data = {
            "success": True,
            "Username": email,
            "Name": f"{given_name} {family_name}",
            "First_name": given_name,
            "Last_name": family_name,
            "One-time_password": otp_password or '',
        }

        # 打印调试信息
        log(f"[DEBUG] One-time_password 字段: {result_data.get('One-time_password', '(无)')}")

        log(f"[OK] 用户创建请求已提交: {email}")
        log(f"[DEBUG] 最终数据: {result_data}")
        return result_data

    except Exception as e:
        log(f"[FAIL] 创建用户失败: {e}", "ERR")
        # 截图保存
        try:
            driver.save_screenshot(f"error_{int(time.time())}.png")
            log("[INFO] 已保存错误截图")
        except:
            pass
        return False


def register_users(count, aws_username=None, aws_password=None, headless=False, manual_login=False):
    """批量注册用户"""
    try:
        import undetected_chromedriver as uc
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
    except ImportError as e:
        log(f"[FAIL] 缺少依赖: {e}", "ERR")
        log("[INFO] 请运行: pip install undetected-chromedriver selenium", "ERR")
        return []

    options = uc.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-first-run")
    options.add_argument("--disable-popup-blocking")
    if headless:
        options.add_argument("--headless=new")
    else:
        options.add_argument("--start-maximized")

    driver = None
    created_users = []

    try:
        log("启动 Chrome 浏览器...")
        driver = uc.Chrome(version_main=144, options=options, use_subprocess=True)
        wait = WebDriverWait(driver, 30)

        if manual_login:
            # 手动登录模式：打开登录页面，等待用户手动登录
            log("打开 AWS 登录页面，请手动登录...")
            driver.get(AWS_LOGIN_URL)
            input("\n>>> 请在浏览器中完成登录，登录成功后按 Enter 键继续...")
            log("[OK] 用户确认已登录，继续执行...")
        else:
            # 自动登录模式
            if not aws_username or not aws_password:
                log("[FAIL] 自动登录模式需要提供用户名和密码", "ERR")
                return []
            if not login_aws_console(driver, wait, aws_username, aws_password):
                log("[FAIL] AWS 登录失败，退出", "ERR")
                return []

        # 批量创建用户
        for i in range(count):
            print(f"\n{'='*15} 创建第 {i+1}/{count} 个用户 {'='*15}", flush=True)

            email = generate_random_email()
            given_name, family_name = generate_random_name()

            result = create_user_via_browser(driver, wait, email, given_name, family_name)

            if result and isinstance(result, dict) and result.get('success'):
                # 保存完整的用户信息
                created_users.append(result)

                # 追加写入到本地文件（排除 success 字段）
                user_info = {k: v for k, v in result.items() if k != 'success'}
                save_user_to_file(user_info)

            elif result:  # 兼容旧的 True 返回值
                user_info = {
                    'Username': email,
                    'Name': f"{given_name} {family_name}",
                    'One-time_password': None
                }
                created_users.append(user_info)
                save_user_to_file(user_info)

            # 批量创建时增加随机延迟
            if i < count - 1:
                delay = random.randint(3, 8)
                log(f"[WAIT] 等待 {delay} 秒...")
                time.sleep(delay)

    except Exception as e:
        log(f"[FAIL] 发生异常: {e}", "ERR")
    finally:
        if driver:
            log("[INFO] 注册完成，浏览器保持打开状态")
            log("[INFO] 请手动关闭浏览器窗口")
            # 不自动关闭浏览器，让用户手动关闭

    return created_users


def main():
    parser = argparse.ArgumentParser(description='AWS IAM Identity Center 用户注册工具 (浏览器版)')
    parser.add_argument('--username', '-u', type=str, help='AWS IAM 用户名 (手动登录模式下可省略)')
    parser.add_argument('--password', '-p', type=str, help='AWS IAM 密码 (手动登录模式下可省略)')
    parser.add_argument('--count', '-c', type=int, default=1, help='创建用户数量 (默认: 1)')
    parser.add_argument('--headless', action='store_true', help='无头模式运行')
    parser.add_argument('--manual', '-m', action='store_true', default=True, help='手动登录模式：打开浏览器后等待用户手动登录 (默认)')
    parser.add_argument('--auto', '-a', action='store_true', help='自动登录模式：需要提供用户名和密码')

    args = parser.parse_args()

    # 如果指定了 --auto，则关闭手动模式
    if args.auto:
        args.manual = False

    # 检查参数
    if not args.manual and (not args.username or not args.password):
        parser.error("自动登录模式需要提供 --username 和 --password")

    log("[START] AWS IAM Identity Center 用户注册 (浏览器版)")
    log(f"[CONFIG] 创建数量: {args.count}")
    log(f"[CONFIG] 登录模式: {'手动登录' if args.manual else '自动登录'}")
    log(f"[CONFIG] 无头模式: {'是' if args.headless else '否'}")

    created_users = register_users(
        count=args.count,
        aws_username=args.username,
        aws_password=args.password,
        headless=args.headless,
        manual_login=args.manual
    )

    print(f"\n{'='*30}", flush=True)
    print(f"任务结束！成功: {len(created_users)}/{args.count}", flush=True)

    if created_users:
        print(f"\n{'='*15} 创建的用户列表 {'='*15}", flush=True)
        for user in created_users:
            print(f"邮箱: {user['email']}", flush=True)
            print(f"姓名: {user['name']}", flush=True)
            if user.get('otp'):
                print(f"一次性密码: {user['otp']}", flush=True)
            else:
                print(f"一次性密码: (未获取)", flush=True)
            print("-" * 30, flush=True)

    return 0 if created_users else 1


if __name__ == "__main__":
    sys.exit(main())
