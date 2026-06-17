tell application "Terminal"
	if not (exists front window) then error "No Terminal window" number -1
	return tty of front window
end tell
