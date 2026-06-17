tell application "iTerm"
	if not (exists current window) then error "No iTerm window" number -1
	tell current session of current window
		return variable named "session.path"
	end tell
end tell
