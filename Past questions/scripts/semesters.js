// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Go back function
function goBack() {
    window.history.back();
}

// Display level and department info from URL parameters
document.addEventListener('DOMContentLoaded', function() {
    const department = getUrlParameter('department');
    const level = getUrlParameter('level');
    const faculty = getUrlParameter('faculty');
    
    if (department && level) {
        document.getElementById('levelInfo').textContent = `${department} - Level ${level}`;
    }
    
    // Add click handlers to semester cards
    const semesterCards = document.querySelectorAll('.course-card');
    
    semesterCards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        
        card.addEventListener('click', function() {
            const semester = this.getAttribute('data-semester');
            // Navigate to courses/past questions page with all parameters
            // You can customize this to go to your actual past questions display page
            window.location.href = `past-questions-list.html?department=${encodeURIComponent(department)}&faculty=${encodeURIComponent(faculty)}&level=${level}&semester=${semester}`;
        });
        
        // Add keyboard navigation
        card.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click();
            }
        });
        
        // Add focus effects
        card.addEventListener('focus', function() {
            this.style.outline = '3px solid #667eea';
            this.style.outlineOffset = '2px';
        });
        
        card.addEventListener('blur', function() {
            this.style.outline = 'none';
        });
    });
});

// Add loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});