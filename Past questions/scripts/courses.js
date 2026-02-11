// Filter courses based on search input
function filterCourses() {
    const searchInput = document.getElementById('courseSearch');
    if (!searchInput) return; // Only run if search box exists
    
    const searchTerm = searchInput.value.toLowerCase();
    const courseCards = document.querySelectorAll('.course-card');
    
    courseCards.forEach(card => {
        const courseName = card.querySelector('h3').textContent.toLowerCase();
        if (courseName.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Get URL parameter
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Add click handlers when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    const courseCards = document.querySelectorAll('.course-card');
    const faculty = getUrlParameter('faculty') || getCurrentFacultyFromPage();
    
    courseCards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        
        card.addEventListener('click', function() {
            const course = this.getAttribute('data-course');
            // Navigate to levels page with department and faculty info
            window.location.href = `levels.html?department=${encodeURIComponent(course)}&faculty=${encodeURIComponent(faculty)}`;
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

// Helper function to get current faculty from page title or subtitle
function getCurrentFacultyFromPage() {
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) {
        return subtitle.textContent;
    }
    return 'Unknown Faculty';
}

// Add loading animation
window.addEventListener('load', function() {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s';
        document.body.style.opacity = '1';
    }, 100);
});