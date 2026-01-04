@echo off
REM Reinstall Akira extension script for Windows

echo Uninstalling current extension...
code --uninstall-extension DigitalDefiance.ai-capabilities-suite-akira
if errorlevel 1 echo Extension not installed or already uninstalled

echo Building extension...
call npm run build
if errorlevel 1 exit /b 1

echo Packaging extension...
set VSIX_FILE=akira-reinstall-%date:~-4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%%time:~6,2%.vsix
set VSIX_FILE=%VSIX_FILE: =0%
call npx @vscode/vsce package --out %VSIX_FILE%
if errorlevel 1 exit /b 1

echo Installing extension...
code --install-extension %VSIX_FILE%
if errorlevel 1 exit /b 1

echo.
echo ===================================
echo Done! Extension installed: %VSIX_FILE%
echo.
echo Please manually reload VS Code window:
echo   - Press F1
echo   - Type 'Developer: Reload Window'
echo   - Press Enter
echo ===================================
