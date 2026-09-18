// ============================================
// EXCLUSIVEMEMBRS
// SONGWARS III LIVE SYSTEM
// ============================================


// SONGWARS III
// November 21, 2026
// 8:00 PM Eastern Standard Time

const songWarsDate =
    new Date("2026-11-21T20:00:00-05:00");


// --------------------------------------------
// COUNTDOWN
// --------------------------------------------

function updateSongWarsCountdown() {

    const now = new Date();

    const distance =
        songWarsDate.getTime() - now.getTime();


    const daysElement =
        document.getElementById("days");

    const hoursElement =
        document.getElementById("hours");

    const minutesElement =
        document.getElementById("minutes");

    const secondsElement =
        document.getElementById("seconds");

    const statusElement =
        document.getElementById("event-status");


    // Stop if countdown isn't on this page

    if (
        !daysElement ||
        !hoursElement ||
        !minutesElement ||
        !secondsElement
    ) {
        return;
    }


    // ----------------------------------------
    // EVENT HAS STARTED
    // ----------------------------------------

    if (distance <= 0) {

        daysElement.textContent = "00";
        hoursElement.textContent = "00";
        minutesElement.textContent = "00";
        secondsElement.textContent = "00";

        if (statusElement) {

            statusElement.textContent =
                "● SONGWARS III IS LIVE";

            statusElement.classList.add(
                "event-live"
            );

        }

        clearInterval(songWarsTimer);

        return;
    }


    // ----------------------------------------
    // CALCULATE TIME
    // ----------------------------------------

    const days = Math.floor(
        distance /
        (1000 * 60 * 60 * 24)
    );


    const hours = Math.floor(
        (
            distance %
            (1000 * 60 * 60 * 24)
        ) /
        (1000 * 60 * 60)
    );


    const minutes = Math.floor(
        (
            distance %
            (1000 * 60 * 60)
        ) /
        (1000 * 60)
    );


    const seconds = Math.floor(
        (
            distance %
            (1000 * 60)
        ) /
        1000
    );


    // ----------------------------------------
    // DISPLAY
    // ----------------------------------------

    daysElement.textContent =
        String(days).padStart(2, "0");

    hoursElement.textContent =
        String(hours).padStart(2, "0");

    minutesElement.textContent =
        String(minutes).padStart(2, "0");

    secondsElement.textContent =
        String(seconds).padStart(2, "0");

}


// Run immediately so visitors don't see 00s

updateSongWarsCountdown();


// Update every second

const songWarsTimer =
    setInterval(
        updateSongWarsCountdown,
        1000
    );
