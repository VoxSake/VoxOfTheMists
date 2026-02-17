(() => {
  // Apply theme before React mounts to avoid flash.
  if (localStorage.getItem("vox-theme") !== "light") {
    document.body.classList.add("dark");
  }
})();
