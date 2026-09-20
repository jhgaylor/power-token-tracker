UUID = power-token-tracker@jhgaylor.local
EXTDIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)

.PHONY: all schemas install link uninstall pack check

all: schemas

# Compile the GSettings schema in-tree (required before the extension will load).
schemas: schemas/gschemas.compiled

schemas/gschemas.compiled: schemas/*.gschema.xml
	glib-compile-schemas schemas/

# Copy the extension into place.
install: schemas
	rm -rf $(EXTDIR)
	mkdir -p $(EXTDIR)
	cp -r extension.js prefs.js metadata.json stylesheet.css schemas $(EXTDIR)
	@echo "Installed. Log out and back in (Wayland), then: gnome-extensions enable $(UUID)"

# Symlink this checkout into place instead, for development.
link: schemas
	rm -rf $(EXTDIR)
	ln -s $(CURDIR) $(EXTDIR)
	@echo "Linked $(EXTDIR) -> $(CURDIR)"

uninstall:
	rm -rf $(EXTDIR)

# Build a zip suitable for extensions.gnome.org.
pack: schemas
	gnome-extensions pack --force \
		--extra-source=stylesheet.css \
		--schema=schemas/org.gnome.shell.extensions.power-token-tracker.gschema.xml \
		.

# Load the extension in a throwaway nested shell and report its state.
check: schemas
	./test-nested.sh
