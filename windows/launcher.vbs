' VBScript launcher to start windows\launch.bat silently without a console window
Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

currentDir = FSO.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\launch.bat"

If FSO.FileExists(batPath) Then
    ' 0 = Hide console window, False = Return immediately
    WshShell.Run """" & batPath & """", 0, False
Else
    MsgBox "Файл launch.bat не найден в папке: " & currentDir, 16, "Ошибка запуска"
End If
