# [Sylva]

Sylva is a browser-based notes & tasks website built with HTML, CSS, and vanilla JavaScript. I made it as a lightweight personal space for writing things down quickly, keeping small tasks in one place, and revisiting old notes in a more reflective way. 

Instead of focusing only on basic note-taking, I wanted the app to feel a little more personal, so I added features like calendar browsing, random memory resurfacing, and an “on this day” view, where users can look back on diary entries from the same date in previous years.

Because everything runs on the user side, Sylva does not require an account, a database, or a backend server. It can be opened directly in the browser and stores data locally using `localStorage`.



# [What It Does?]
Sylva combines a few related tools in one interface:

- Notes
Write and save notes directly in the browser
Attach images to notes
View, edit, archive, and organize entries over time

- Tasks
Add lightweight tasks in a separate view
Mark tasks as done and reopen them later if needed
Keep task management simple and low-friction

- Organization
Group notes and tasks with tag categories
Filter entries by tag
Search notes by keywords

- Memory-oriented features
Browse notes by calendar date
“On This Day” view for revisiting older notes from the same date
Random note draw for resurfacing past entries
Basic statistics view for activity and writing patterns

- Backup and customization
Export data as `.txt` or `.json`
Import backups from exported `.json` files
Customize theme color, font style, dark mode, and display preferences



# [Tech Stack]

- HTML
- CSS
- Vanilla JavaScript
- `localStorage` for client-side persistence



# [Running Locally]

1. Clone this repository.
2. Open `index.html` in a browser.
No build step or external backend is required.

- OR: You can directly use the link below.
animated-frangipane-760ed4.netlify.app



# [Data storage]

Sylva stores all notes, tasks, tags, and settings in the browser using localStorage.

That means:
- your data stays on the current browser/device
- clearing browser data may remove saved content
- data does not automatically sync across devices
- exporting a JSON backup is recommended if the content matters

This was a deliberate tradeoff to keep the project simple and fully client-side.



# [What I Worked On In This Project]

Some of the main implementation pieces include:

- designing a single-page interface with separate notes and tasks flows
- rendering and updating notes/tasks dynamically in vanilla JavaScript
- storing application state in localStorage
- building tag-based filtering and calendar-based note browsing
- implementing backup import/export
- supporting UI customization such as theme colors, font selection, and dark mode
- adding more personal features like random memory resurfacing and “on this day”



# [Limitations]

This project is lightweight, so there are some limitations:

- no cloud sync or user accounts and no backend database
- data is tied to the current browser unless exported
- image-heavy usage may run into browser storage limits



# [Possible Future Improvements]

If I continue developing Sylva, some features I would consider adding include markdown support for notes, backend storage, optional cloud sync, mobile-specific interaction improvements, and more features that make the app feel engaging and personal to use.



# [Screenshots]

