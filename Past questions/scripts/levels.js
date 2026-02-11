// Get URL parameters
function getUrlParameter(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}

// Go back function
function goBack() {
    window.history.back();
}

// Display department name from URL parameter
document.addEventListener('DOMContentLoaded', function() {
    const department = getUrlParameter('department');
    const faculty = getUrlParameter('faculty');
    
    if (department) {
        document.getElementById('departmentName').textContent = department;
    }
    
    // Add click handlers to level cards
    const levelCards = document.querySelectorAll('.course-card');
    
    levelCards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        
        card.addEventListener('click', function() {
            const level = this.getAttribute('data-level');
            // Navigate to semesters page with parameters
            window.location.href = `semesters.html?department=${encodeURIComponent(department)}&faculty=${encodeURIComponent(faculty)}&level=${level}`;
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