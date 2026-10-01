// zen-tab-grid.exe —— Zen 标签页网格 / 滚轮横向翻页 / 冻结变灰 的一键安装器
// 编译：build.cmd（用 Windows 自带的 csc.exe，无需任何额外工具链）
// 说明：本程序只写 4 个地方（配置目录的 chrome\userChrome.css、userChrome.js、user.js，
//       以及 Zen 安装目录的 browser\omni.ja，且会先备份为 omni.ja.bak）。不联网上报。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.IO.Compression;

static class Program
{
    const string Repo = "baihuazidongd/zen-tab-grid";
    const string Branch = "main";
    const string TargetEntry = "chrome/browser/content/browser/browser-main.js";
    const string LoaderMarker = "zenuserchrome";
    const string PrefLine = "user_pref(\"toolkit.legacyUserProfileCustomizations.stylesheets\", true);";

    static int Main(string[] args)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { }

        string mode = "menu";
        string patchFileArg = null;
        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i].ToLowerInvariant();
            if (a == "--install") mode = "install";
            else if (a == "--style-only") mode = "style";
            else if (a == "--uninstall") mode = "uninstall";
            else if (a == "--update") mode = "update";
            else if (a == "--status") mode = "status";
            else if (a == "--patch-file" && i + 1 < args.Length) { mode = "patchfile"; patchFileArg = args[i + 1]; }
        }

        try
        {
            switch (mode)
            {
                case "install": return DoInstall(true);
                case "style": return DoInstall(false);
                case "uninstall": return DoUninstall();
                case "update": return DoUpdate();
                case "status": return DoStatus();
                case "patchfile": return DoPatchFile(patchFileArg);
                default: return Menu();
            }
        }
        catch (Exception ex)
        {
            Err(ex.Message);
            if (Environment.UserInteractive) { Console.WriteLine(); Console.WriteLine("按任意键退出…"); Console.ReadKey(); }
            return 1;
        }
    }

    // ---------------- 交互菜单 ----------------
    static int Menu()
    {
        Console.WriteLine("zen-tab-grid — Zen 标签页网格 + 滚轮横向翻页 + 冻结变灰");
        Console.WriteLine("仓库: https://github.com/" + Repo);
        Console.WriteLine();
        PrintStatus();
        Console.WriteLine();
        Console.WriteLine("  1) 完整安装（含 omni.ja 补丁，需要管理员；三项功能全开）");
        Console.WriteLine("  2) 仅装样式（免管理员；有网格和冻结变灰，滚轮仍是上下滚）");
        Console.WriteLine("  3) 从仓库检查并更新");
        Console.WriteLine("  4) 卸载补丁（还原 omni.ja 备份）");
        Console.WriteLine("  5) 退出");
        Console.Write("选择 [1-5]: ");
        string k = Console.ReadLine();
        if (string.IsNullOrEmpty(k)) return 0;
        switch (k.Trim())
        {
            case "1": return RunAndHold(DoInstall(true));
            case "2": return RunAndHold(DoInstall(false));
            case "3": return RunAndHold(DoUpdate());
            case "4": return RunAndHold(DoUninstall());
            default: return 0;
        }
    }

    static int RunAndHold(int code)
    {
        if (Environment.UserInteractive) { Console.WriteLine(); Console.WriteLine("按任意键返回菜单…"); Console.ReadKey(); }
        return code;
    }

    // ---------------- 状态 ----------------
    static void PrintStatus()
    {
        string profile = TryResolveProfile();
        string install = TryResolveInstall();
        Console.WriteLine("配置目录: " + (profile ?? "未找到"));
        Console.WriteLine("Zen 安装目录: " + (install ?? "未找到"));
        if (profile != null)
        {
            string css = Path.Combine(Path.Combine(profile, "chrome"), "userChrome.css");
            string js = Path.Combine(Path.Combine(profile, "chrome"), "userChrome.js");
            Console.WriteLine("  userChrome.css : " + (File.Exists(css) ? "已安装" : "未安装"));
            Console.WriteLine("  userChrome.js  : " + (File.Exists(js) ? "已安装" : "未安装"));
            Console.WriteLine("  样式表开关     : " + (PrefEnabled(profile) ? "已打开" : "未打开"));
        }
        if (install != null)
        {
            string omni = Path.Combine(install, Path.Combine("browser", "omni.ja"));
            Console.WriteLine("  omni.ja 补丁   : " + (File.Exists(omni) && OmniHasPatch(omni) ? "已打上" : "未打上"));
        }
        Console.WriteLine("  当前权限       : " + (IsAdmin() ? "管理员" : "普通用户"));
    }

    static int DoStatus() { PrintStatus(); return 0; }

    // ---------------- 安装 ----------------
    static int DoInstall(bool withPatch)
    {
        string profile = ResolveProfile();
        Log("配置目录: " + profile);

        string chromeDir = Path.Combine(profile, "chrome");
        Directory.CreateDirectory(chromeDir);
        WriteResource("userChrome.css", Path.Combine(chromeDir, "userChrome.css"));
        WriteResource("userChrome.js", Path.Combine(chromeDir, "userChrome.js"));
        Log("已写入 userChrome.css / userChrome.js");

        EnsurePref(profile);

        if (!withPatch)
        {
            Warn("已按「仅装样式」完成：滚轮横向翻页需要 omni.ja 补丁，这里没打。");
            Done();
            return 0;
        }

        string install = ResolveInstall();
        Log("Zen 安装目录: " + install);
        string omni = Path.Combine(install, Path.Combine("browser", "omni.ja"));
        if (!File.Exists(omni)) throw new Exception("找不到 " + omni);

        if (!IsAdmin())
        {
            Warn("补丁这一步要写 Program Files，需要管理员权限，正在请求提权…");
            ElevateAndForward("--install");
            return 0;
        }

        if (ZenRunning())
        {
            Err("Zen 还在运行，omni.ja 被占用。请先完全退出 Zen（菜单 → 退出），再重跑。");
            return 3;
        }

        PatchOmni(omni);
        Done();
        return 0;
    }

    static void Done()
    {
        Console.WriteLine();
        Log("完成。重启 Zen 即生效。");
        Console.WriteLine("提示：Zen 自动更新会把 omni.ja 补丁冲掉（表现为滚轮又变成上下滚），重跑本 exe 选 1 或 3 即可。");
    }

    // ---------------- 补丁核心 ----------------
    static void PatchOmni(string omni)
    {
        string orig = ReadZipEntry(omni, TargetEntry);
        if (orig == null) throw new Exception("omni.ja 里没有 " + TargetEntry + "，Zen 结构可能已变，请把 Zen 版本反馈给作者。");
        if (orig.Contains(LoaderMarker)) { Log("补丁已在，无需重复。"); return; }

        string loader = ReadResource("loader-snippet.txt");
        string patched = orig + "\n" + loader;

        string tmp = Path.Combine(Path.GetTempPath(), "zen-tab-grid-omni.ja");
        if (File.Exists(tmp)) File.Delete(tmp);
        int count = RebuildZip(omni, tmp, TargetEntry, patched);

        // 校验后才替换
        string back = ReadZipEntry(tmp, TargetEntry);
        if (back == null || !back.Contains(LoaderMarker)) { File.Delete(tmp); throw new Exception("新包校验失败（找不到加载器），已放弃替换。"); }
        int newCount = CountEntries(tmp);
        if (newCount != count) { File.Delete(tmp); throw new Exception("新包条目数不一致（" + newCount + " vs " + count + "），已放弃替换。"); }

        string bak = omni + ".bak";
        if (!File.Exists(bak))
        {
            File.Copy(omni, bak);
            Log("已备份原文件 -> " + bak);
        }
        else
        {
            Log("备份已存在，保留不动：" + bak);
        }

        File.Copy(tmp, omni, true);
        File.Delete(tmp);
        Log("补丁已写入 " + omni + "（" + count + " 个条目，含加载器）");
    }

    // 供自测用：对任意路径的 omni.ja 打补丁（不碰安装目录）
    static int DoPatchFile(string path)
    {
        if (string.IsNullOrEmpty(path) || !File.Exists(path)) throw new Exception("文件不存在: " + path);
        PatchOmni(path);
        Console.WriteLine("TEST-OK patched=" + path + " entries=" + CountEntries(path));
        return 0;
    }

    static int RebuildZip(string srcPath, string dstPath, string targetEntry, string targetContent)
    {
        int count = 0;
        using (FileStream fsIn = File.OpenRead(srcPath))
        using (ZipArchive zin = new ZipArchive(fsIn, ZipArchiveMode.Read))
        using (FileStream fsOut = File.Create(dstPath))
        using (ZipArchive zout = new ZipArchive(fsOut, ZipArchiveMode.Create))
        {
            foreach (ZipArchiveEntry e in zin.Entries)
            {
                ZipArchiveEntry ne = zout.CreateEntry(e.FullName, CompressionLevel.NoCompression);
                ne.LastWriteTime = e.LastWriteTime;
                using (Stream si = e.Open())
                using (Stream so = ne.Open())
                {
                    if (string.Equals(e.FullName, targetEntry, StringComparison.OrdinalIgnoreCase))
                    {
                        byte[] data = new UTF8Encoding(false).GetBytes(targetContent);
                        so.Write(data, 0, data.Length);
                    }
                    else
                    {
                        si.CopyTo(so);
                    }
                }
                count++;
            }
        }
        return count;
    }

    static int CountEntries(string path)
    {
        using (FileStream fs = File.OpenRead(path))
        using (ZipArchive z = new ZipArchive(fs, ZipArchiveMode.Read)) { return z.Entries.Count; }
    }

    static string ReadZipEntry(string zipPath, string name)
    {
        using (FileStream fs = File.OpenRead(zipPath))
        using (ZipArchive z = new ZipArchive(fs, ZipArchiveMode.Read))
        {
            ZipArchiveEntry e = z.GetEntry(name);
            if (e == null) return null;
            using (StreamReader sr = new StreamReader(e.Open(), Encoding.UTF8)) { return sr.ReadToEnd(); }
        }
    }

    static bool OmniHasPatch(string omni)
    {
        try
        {
            string t = ReadZipEntry(omni, TargetEntry);
            return t != null && t.Contains(LoaderMarker);
        }
        catch { return false; }
    }

    // ---------------- 卸载 ----------------
    static int DoUninstall()
    {
        if (!IsAdmin()) { Warn("需要管理员权限，正在请求提权…"); ElevateAndForward("--uninstall"); return 0; }
        string install = ResolveInstall();
        string omni = Path.Combine(install, Path.Combine("browser", "omni.ja"));
        string bak = omni + ".bak";
        if (!File.Exists(bak)) throw new Exception("没有备份 " + bak + "，无法还原。");
        if (ZenRunning()) { Err("Zen 还在运行，请先完全退出。"); return 3; }
        File.Copy(bak, omni, true);
        Log("已还原 " + omni);
        Console.WriteLine("如需彻底清掉：删除配置目录下的 chrome\\userChrome.css、chrome\\userChrome.js，以及 user.js 里追加的那两行。");
        return 0;
    }

    // ---------------- 更新 ----------------
    static int DoUpdate()
    {
        string profile = ResolveProfile();
        string chromeDir = Path.Combine(profile, "chrome");
        Directory.CreateDirectory(chromeDir);
        string[] files = new string[] { "userChrome.css", "userChrome.js" };
        using (WebClient wc = new WebClient())
        {
            wc.Encoding = Encoding.UTF8;
            foreach (string f in files)
            {
                try
                {
                    string url = "https://raw.githubusercontent.com/" + Repo + "/" + Branch + "/" + f;
                    File.WriteAllText(Path.Combine(chromeDir, f), wc.DownloadString(url), new UTF8Encoding(false));
                    Log("更新 " + f);
                }
                catch (Exception ex) { Warn("跳过 " + f + "：" + ex.Message); }
            }
        }
        EnsurePref(profile);

        string install = TryResolveInstall();
        if (install != null)
        {
            string omni = Path.Combine(install, Path.Combine("browser", "omni.ja"));
            if (File.Exists(omni) && !OmniHasPatch(omni))
                Warn("检测到 omni.ja 补丁缺失（Zen 可能刚自动更新过）。请完全退出 Zen，再选 1 重装补丁（需管理员）。");
            else if (File.Exists(omni)) Log("omni.ja 补丁完好。");
        }
        Log("更新完成，重启 Zen 生效。");
        return 0;
    }

    // ---------------- 定位 ----------------
    static string TryResolveProfile()
    {
        try { return ResolveProfile(); } catch { return null; }
    }

    // 读 profiles.ini。两个坑：[Install<hash>] 的 Default= 存的是「路径」而不是下标；
    // 另外可能存在带 Default=1 的空壳配置（Zen 自动建的），不能拿它当在用配置。
    static string ResolveProfile()
    {
        string ini = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                                  Path.Combine("zen", "profiles.ini"));
        if (!File.Exists(ini)) throw new Exception("找不到 " + ini + "，请手动指定配置目录。");

        Dictionary<string, string> profiles = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string installDefault = null;
        string cur = "";
        foreach (string line in File.ReadAllLines(ini))
        {
            string l = line.Trim();
            if (l.StartsWith("[") && l.EndsWith("]")) { cur = l.Substring(1, l.Length - 2); continue; }
            if (cur.StartsWith("Profile") && l.StartsWith("Path=", StringComparison.OrdinalIgnoreCase))
            {
                string p = l.Substring(5).Trim();
                if (!profiles.ContainsKey(p.Replace('\\', '/'))) profiles.Add(p.Replace('\\', '/'), p);
            }
            if (cur.StartsWith("Install") && l.StartsWith("Default=", StringComparison.OrdinalIgnoreCase))
                installDefault = l.Substring(8).Trim();
        }
        if (profiles.Count == 0) throw new Exception("profiles.ini 里没有任何 [ProfileN]。");

        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "zen");
        Func<string, string> toDir = delegate (string p)
        {
            if (Path.IsPathRooted(p)) return p;
            return Path.Combine(root, p.Replace('/', Path.DirectorySeparatorChar));
        };

        if (installDefault != null)
        {
            string key = installDefault.Replace('\\', '/');
            if (profiles.ContainsKey(key)) return toDir(profiles[key]);
            string d = toDir(installDefault);
            if (Directory.Exists(d)) return d;
        }
        if (profiles.Count == 1)
        {
            foreach (string v in profiles.Values) return toDir(v);
        }
        // 多个候选：取 prefs.js 最近写过的那个（= 真正在用）
        string best = null; DateTime bestT = DateTime.MinValue;
        foreach (string v in profiles.Values)
        {
            string dir = toDir(v);
            string prefs = Path.Combine(dir, "prefs.js");
            if (File.Exists(prefs))
            {
                DateTime t = File.GetLastWriteTime(prefs);
                if (t > bestT) { bestT = t; best = dir; }
            }
        }
        if (best != null) return best;
        throw new Exception("无法确定在用配置目录，请把目录作为参数传给 install.ps1 -ProfileDir，或手动改这里。");
    }

    static string TryResolveInstall()
    {
        try { return ResolveInstall(); } catch { return null; }
    }

    static string ResolveInstall()
    {
        List<string> cands = new List<string>();
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrEmpty(pf)) cands.Add(Path.Combine(pf, "Zen Browser"));
        if (!string.IsNullOrEmpty(pf86)) cands.Add(Path.Combine(pf86, "Zen Browser"));
        if (!string.IsNullOrEmpty(local)) cands.Add(Path.Combine(local, Path.Combine("Programs", "Zen Browser")));
        foreach (string c in cands) if (File.Exists(Path.Combine(c, "zen.exe"))) return c;

        foreach (Process p in Process.GetProcessesByName("zen"))
        {
            try
            {
                string path = p.MainModule.FileName;
                if (!string.IsNullOrEmpty(path)) return Path.GetDirectoryName(path);
            }
            catch { }
        }
        throw new Exception("找不到 Zen 安装目录（zen.exe）。");
    }

    static bool ZenRunning()
    {
        Process[] ps = Process.GetProcessesByName("zen");
        return ps.Length > 0;
    }

    // ---------------- 杂项 ----------------
    static bool IsAdmin()
    {
        using (WindowsIdentity id = WindowsIdentity.GetCurrent())
        {
            return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
        }
    }

    static void ElevateAndForward(string arg)
    {
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = Assembly.GetExecutingAssembly().Location;
        psi.Arguments = arg;
        psi.Verb = "runas";
        psi.UseShellExecute = true;
        try
        {
            Process.Start(psi);
            Log("已在管理员窗口中继续，请切过去看。");
        }
        catch (Exception ex) { Warn("提权被取消：" + ex.Message); }
    }

    static bool PrefEnabled(string profile)
    {
        try
        {
            string userJs = Path.Combine(profile, "user.js");
            if (File.Exists(userJs) && File.ReadAllText(userJs).Contains("legacyUserProfileCustomizations.stylesheets")) return true;
            string prefsJs = Path.Combine(profile, "prefs.js");
            if (File.Exists(prefsJs) && File.ReadAllText(prefsJs).Contains("legacyUserProfileCustomizations.stylesheets")) return true;
        }
        catch { }
        return false;
    }

    static void EnsurePref(string profile)
    {
        string userJs = Path.Combine(profile, "user.js");
        string existing = File.Exists(userJs) ? File.ReadAllText(userJs) : "";
        if (existing.Contains("legacyUserProfileCustomizations.stylesheets")) { Log("样式表开关已存在，跳过。"); return; }
        File.AppendAllText(userJs, "\n// ---- zen-tab-grid ----\n" + PrefLine + "\n", new UTF8Encoding(false));
        Log("已在 user.js 打开样式表开关");
    }

    static void WriteResource(string resName, string destPath)
    {
        string content = ReadResource(resName);
        File.WriteAllText(destPath, content, new UTF8Encoding(false));
    }

    static string ReadResource(string resName)
    {
        Assembly a = Assembly.GetExecutingAssembly();
        string full = null;
        foreach (string n in a.GetManifestResourceNames())
        {
            if (n.EndsWith(resName, StringComparison.OrdinalIgnoreCase)) { full = n; break; }
        }
        if (full == null) throw new Exception("内嵌资源缺失：" + resName + "（这个 exe 可能不完整）");
        using (Stream s = a.GetManifestResourceStream(full))
        using (StreamReader sr = new StreamReader(s, Encoding.UTF8)) { return sr.ReadToEnd(); }
    }

    static void Log(string m) { Console.WriteLine("[ok] " + m); }
    static void Warn(string m) { Console.WriteLine("[!!] " + m); }
    static void Err(string m) { Console.WriteLine("[错误] " + m); }
}
